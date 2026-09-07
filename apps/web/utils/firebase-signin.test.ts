import { beforeEach, describe, expect, it, vi } from 'vitest'

const apps = vi.hoisted(() => [] as object[])
const initializeApp = vi.hoisted(() => vi.fn(() => apps.push({})))
const signInWithEmailAndPassword = vi.hoisted(() => vi.fn(async () => ({})))
const once = vi.hoisted(() => vi.fn(async () => ({ val: () => null })))

vi.mock('firebase/compat/app', () => ({
  default: {
    apps,
    initializeApp,
    auth: () => ({ signInWithEmailAndPassword }),
    database: () => ({ ref: () => ({ once }) }),
  },
}))
vi.mock('firebase/compat/auth', () => ({}))
vi.mock('firebase/compat/database', () => ({}))
vi.mock('./redis', () => ({ getRedis: () => ({}) }))

type Module = typeof import('./firebase.serverside')

// getRequestRecord is the smallest exported path through getFirebase(): one
// sign-in, then one database read. The sign-in memo is module state, so each
// test loads a fresh copy of the module.
async function freshRead() {
  vi.resetModules()
  const mod: Module = await import('./firebase.serverside')
  return () => mod.getRequestRecord('key', 'celo-sepolia')
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

describe('getFirebase sign-in', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apps.length = 0
    process.env.FIREBASE_LOGIN_USERNAME = 'faucet@example.com'
    process.env.FIREBASE_LOGIN_PASSWORD = 'test-only'
    signInWithEmailAndPassword.mockResolvedValue({})
  })

  it('signs in once and reuses it for later calls', async () => {
    const read = await freshRead()
    await read()
    await read()

    expect(initializeApp).toHaveBeenCalledTimes(1)
    expect(signInWithEmailAndPassword).toHaveBeenCalledTimes(1)
    expect(once).toHaveBeenCalledTimes(2)
  })

  // Regression: the app was initialised before the sign-in and readiness was
  // "an app exists", so one rejected sign-in left every later request on the
  // instance skipping sign-in and touching the database unauthenticated.
  it('retries the sign-in on the next call after a rejection', async () => {
    const read = await freshRead()
    signInWithEmailAndPassword.mockRejectedValueOnce(new Error('network'))

    await expect(read()).rejects.toThrow('network')
    expect(once).not.toHaveBeenCalled()

    await expect(read()).resolves.toBeUndefined()
    expect(signInWithEmailAndPassword).toHaveBeenCalledTimes(2)
    expect(once).toHaveBeenCalledTimes(1)
  })

  // Regression: a second concurrent request saw the app already initialised
  // and read before the first request's sign-in had produced a token.
  it('makes a concurrent caller wait for the in-flight sign-in', async () => {
    const read = await freshRead()
    const pending = deferred<object>()
    signInWithEmailAndPassword.mockReturnValueOnce(pending.promise)

    const first = read()
    const second = read()
    await new Promise((r) => setImmediate(r))

    expect(signInWithEmailAndPassword).toHaveBeenCalledTimes(1)
    expect(once).not.toHaveBeenCalled()

    pending.resolve({})
    await Promise.all([first, second])
    expect(once).toHaveBeenCalledTimes(2)
  })

  it('fails closed without credentials and never initialises the app', async () => {
    const read = await freshRead()
    delete process.env.FIREBASE_LOGIN_PASSWORD

    await expect(read()).rejects.toThrow('Login username or password is empty')
    expect(initializeApp).not.toHaveBeenCalled()
    expect(signInWithEmailAndPassword).not.toHaveBeenCalled()
  })
})

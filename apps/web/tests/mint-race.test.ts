import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_KEYS_PER_OWNER } from 'types'

/** Fake that yields at every await, like a real Redis round trip does. */
class YieldingRedis {
  hashes = new Map<string, Map<string, string>>()
  sets = new Map<string, Set<string>>()
  strings = new Map<string, string>()

  private async tick() {
    await new Promise((r) => setImmediate(r))
  }
  private hash(k: string) {
    if (!this.hashes.has(k)) this.hashes.set(k, new Map())
    return this.hashes.get(k)!
  }
  async hset(k: string, v: Record<string, unknown>) {
    await this.tick()
    const h = this.hash(k)
    for (const [a, b] of Object.entries(v)) h.set(a, String(b))
  }
  async hgetall(k: string) {
    await this.tick()
    const h = this.hashes.get(k)
    return h && h.size ? Object.fromEntries(h) : null
  }
  async hget(k: string, f: string) {
    await this.tick()
    return this.hashes.get(k)?.get(f) ?? null
  }
  async hmget(k: string, ...f: string[]) {
    await this.tick()
    const h = this.hashes.get(k)
    if (!h) return null
    return Object.fromEntries(
      f.filter((x) => h.has(x)).map((x) => [x, h.get(x)!]),
    )
  }
  async hdel(k: string, ...f: string[]) {
    await this.tick()
    f.forEach((x) => this.hashes.get(k)?.delete(x))
  }
  async sadd(k: string, ...m: string[]) {
    await this.tick()
    if (!this.sets.has(k)) this.sets.set(k, new Set())
    m.forEach((x) => this.sets.get(k)!.add(x))
  }
  async smembers(k: string) {
    await this.tick()
    return [...(this.sets.get(k) ?? [])]
  }
  async scard(k: string) {
    await this.tick()
    return this.sets.get(k)?.size ?? 0
  }
  async srem(k: string, ...m: string[]) {
    await this.tick()
    m.forEach((x) => this.sets.get(k)?.delete(x))
  }
  async get(k: string) {
    await this.tick()
    return this.strings.get(k) ?? null
  }
  async del(k: string) {
    await this.tick()
    this.hashes.delete(k)
  }
  async expire() {
    await this.tick()
  }
  multi() {
    const ops: Array<() => Promise<unknown>> = []
    const chain: Record<string, unknown> = {
      hset: (k: string, v: Record<string, unknown>) => (
        ops.push(() => this.hset(k, v)), chain
      ),
      sadd: (k: string, ...m: string[]) => (
        ops.push(() => this.sadd(k, ...m)), chain
      ),
      expire: () => (ops.push(async () => undefined), chain),
      exec: async () => {
        for (const op of ops) await op()
      },
    }
    return chain
  }
}

const redis = vi.hoisted(() => ({ current: null as unknown }))
vi.mock('../utils/redis', () => ({ getRedis: () => redis.current }))

import { listKeysForOwner, mintKey } from '../utils/api-key'

let fake: YieldingRedis
const OWNER = '0xrace-owner'

async function race(n: number) {
  fake = new YieldingRedis()
  redis.current = fake
  const results = await Promise.allSettled(
    Array.from({ length: n }, (_, i) => mintKey(OWNER, `k${i}`)),
  )
  const ok = results.filter((r) => r.status === 'fulfilled').length
  const errored = results.length - ok
  const held = (await listKeysForOwner(OWNER)).length
  console.info(
    `    ${n} concurrent -> ${ok} ok, ${errored} errored, owner holds ${held}`,
  )
  return { ok, errored, held }
}

// Regression: the cap rollback used to test set cardinality, which is a
// property of the set rather than of this key, so every racer revoked its own
// key and the owner ended up holding none.
//
// The fake here yields at every await, which a real Redis round trip does.
// A synchronous fake cannot interleave, so it cannot catch this class of bug.
describe('concurrent mintKey', () => {
  beforeEach(() => {
    process.env.FAUCET_API_KEY_PEPPER = 'test-pepper'
    delete process.env.VERCEL_ENV
  })

  it('control: at the cap, everyone succeeds', async () => {
    const r = await race(MAX_KEYS_PER_OWNER)
    expect(r.held).toBe(MAX_KEYS_PER_OWNER)
  })

  it('one over the cap: the excess minter withdraws, the rest keep their keys', async () => {
    const r = await race(MAX_KEYS_PER_OWNER + 1)
    expect(r.held).toBe(MAX_KEYS_PER_OWNER)
    expect(r.ok).toBe(MAX_KEYS_PER_OWNER)
    expect(r.errored).toBe(1)
  })

  it('two over the cap: only the excess withdraw', async () => {
    const r = await race(MAX_KEYS_PER_OWNER + 2)
    expect(r.held).toBe(MAX_KEYS_PER_OWNER)
    expect(r.ok).toBe(MAX_KEYS_PER_OWNER)
    expect(r.errored).toBe(2)
  })
})

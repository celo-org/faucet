import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Minimal in-memory stand-in for the Upstash client. */
class FakeRedis {
  hashes = new Map<string, Map<string, string>>()
  sets = new Map<string, Set<string>>()
  strings = new Map<string, string>()

  private hash(key: string) {
    if (!this.hashes.has(key)) this.hashes.set(key, new Map())
    return this.hashes.get(key)!
  }

  async hset(key: string, value: Record<string, unknown>) {
    const h = this.hash(key)
    for (const [k, v] of Object.entries(value)) h.set(k, String(v))
  }
  async hgetall(key: string) {
    const h = this.hashes.get(key)
    return h && h.size ? Object.fromEntries(h) : null
  }
  async hget(key: string, field: string) {
    return this.hashes.get(key)?.get(field) ?? null
  }
  async hmget(key: string, ...fields: string[]) {
    const h = this.hashes.get(key)
    if (!h) return null
    return Object.fromEntries(
      fields.filter((f) => h.has(f)).map((f) => [f, h.get(f)!]),
    )
  }
  async hdel(key: string, ...fields: string[]) {
    const h = this.hashes.get(key)
    fields.forEach((f) => h?.delete(f))
  }
  async sadd(key: string, ...members: string[]) {
    if (!this.sets.has(key)) this.sets.set(key, new Set())
    members.forEach((m) => this.sets.get(key)!.add(m))
  }
  async smembers(key: string) {
    return [...(this.sets.get(key) ?? [])]
  }
  async scard(key: string) {
    return this.sets.get(key)?.size ?? 0
  }
  async srem(key: string, ...members: string[]) {
    members.forEach((m) => this.sets.get(key)?.delete(m))
  }
  async get(key: string) {
    return this.strings.get(key) ?? null
  }
  async set(key: string, value: string) {
    this.strings.set(key, value)
  }
  async del(key: string) {
    this.hashes.delete(key)
    this.strings.delete(key)
  }
  async expire() {}

  multi() {
    const ops: Array<() => Promise<unknown>> = []
    const chain = {
      hset: (k: string, v: Record<string, unknown>) => (
        ops.push(() => this.hset(k, v)), chain
      ),
      sadd: (k: string, ...m: string[]) => (
        ops.push(() => this.sadd(k, ...m)), chain
      ),
      expire: () => (ops.push(async () => {}), chain),
      exec: async () => {
        for (const op of ops) await op()
      },
    }
    return chain
  }
}

const redis = vi.hoisted(() => ({ current: null as unknown }))
vi.mock('./redis', () => ({ getRedis: () => redis.current }))

import { MAX_KEYS_PER_OWNER } from 'types'
import {
  listKeysForOwner,
  mintKey,
  parseKey,
  revokeKey,
  verifyKey,
} from './api-key'

const OWNER = '0xowner-hash'
const OTHER = '0xsomeone-else'

let fake: FakeRedis

describe('api keys', () => {
  beforeEach(() => {
    fake = new FakeRedis()
    redis.current = fake
    process.env.FAUCET_API_KEY_PEPPER = 'test-pepper'
    delete process.env.VERCEL_ENV
    vi.useRealTimers()
  })

  it('mints a key in the documented format and verifies it', async () => {
    const { key, record } = await mintKey(OWNER, 'my agent')

    expect(key).toMatch(/^cfk_stg_[0-9a-f]{12}_[A-Za-z0-9_-]{43}$/)
    expect(record.ownerHash).toBe(OWNER)
    await expect(verifyKey(key)).resolves.toEqual({
      ok: true,
      keyId: record.keyId,
      ownerHash: OWNER,
    })
  })

  it('never stores the raw secret', async () => {
    const { key } = await mintKey(OWNER, 'my agent')
    const stored = JSON.stringify([...fake.hashes].map(([k, v]) => [k, [...v]]))

    expect(stored).not.toContain(key)
    // Rejoined, not split('_')[3]: a base64url secret may contain '_', so
    // indexing yields a fragment 48% of the time and '' when the secret
    // starts with '_', which makes .not.toContain always fail.
    expect(stored).not.toContain(key.split('_').slice(3).join('_'))
  })

  it.each([
    ['garbage'],
    ['cfk_stg_short_x'],
    ['cfk_xyz_0123456789ab_' + 'a'.repeat(43)],
    ['nope_stg_0123456789ab_' + 'a'.repeat(43)],
  ])('rejects malformed key %s', async (bad) => {
    expect(parseKey(bad)).toBeUndefined()
    await expect(verifyKey(bad)).resolves.toMatchObject({ ok: false })
  })

  // base64url secrets contain '_', so naive splitting on '_' breaks parsing.
  it('parses a key whose secret contains underscores and dashes', () => {
    const secret = `_-${'a'.repeat(41)}`
    const parsed = parseKey(`cfk_stg_0123456789ab_${secret}`)

    expect(parsed).toEqual({ keyId: '0123456789ab', tag: 'stg' })
  })

  it('verifies every minted key regardless of the secret drawn', async () => {
    for (let i = 0; i < 200; i++) {
      fake = new FakeRedis()
      redis.current = fake
      const { key } = await mintKey(OWNER, 'fuzz')
      expect(await verifyKey(key)).toMatchObject({ ok: true })
    }
  })

  it('rejects a well-formed key that was never issued', async () => {
    const unissued = `cfk_stg_0123456789ab_${'a'.repeat(43)}`
    await expect(verifyKey(unissued)).resolves.toEqual({
      ok: false,
      reason: 'unknown',
    })
  })

  // A staging key must not authenticate against production.
  it('rejects a key minted for a different environment', async () => {
    const { key } = await mintKey(OWNER, 'staging key')
    process.env.VERCEL_ENV = 'production'

    await expect(verifyKey(key)).resolves.toEqual({
      ok: false,
      reason: 'malformed',
    })
  })

  it('rejects every key while the kill switch is set', async () => {
    const { key } = await mintKey(OWNER, 'my agent')
    await fake.set('api-keys:disabled', '1')

    await expect(verifyKey(key)).resolves.toEqual({
      ok: false,
      reason: 'disabled',
    })
  })

  it('rejects an expired key and drops it from the listing', async () => {
    const { key, record } = await mintKey(OWNER, 'my agent')
    const stored = [...fake.hashes.keys()].find(
      (k) => k.startsWith('api-keys:') && !k.endsWith(':index'),
    )!
    fake.hashes.get(stored)!.set('expiresAt', String(Date.now() - 1))

    await expect(verifyKey(key)).resolves.toEqual({
      ok: false,
      reason: 'unknown',
    })
    await expect(listKeysForOwner(OWNER)).resolves.toEqual([])
    expect(await fake.hget('api-keys:index', record.keyId)).toBeNull()
  })

  it('lists only the owner’s own keys', async () => {
    await mintKey(OWNER, 'mine')
    await mintKey(OTHER, 'theirs')

    const mine = await listKeysForOwner(OWNER)
    expect(mine).toHaveLength(1)
    expect(mine[0].label).toBe('mine')
  })

  it(`caps an owner at ${MAX_KEYS_PER_OWNER} active keys`, async () => {
    for (let i = 0; i < MAX_KEYS_PER_OWNER; i++) {
      await mintKey(OWNER, `key ${i}`)
    }
    await expect(mintKey(OWNER, 'one too many')).rejects.toThrow(/already have/)
  })

  // Regression: the cap was check-then-act, so concurrent mints could both
  // pass it and leave the owner over the limit.
  it('holds the cap when mints race', async () => {
    const results = await Promise.allSettled([
      mintKey(OWNER, 'race a'),
      mintKey(OWNER, 'race b'),
      mintKey(OWNER, 'race c'),
    ])

    const minted = results.filter((r) => r.status === 'fulfilled').length
    // Greater than zero matters as much as the cap: a rollback that fires on
    // every racer would leave the owner with nothing and still be <= the cap.
    expect(minted).toBeGreaterThan(0)
    expect(minted).toBeLessThanOrEqual(MAX_KEYS_PER_OWNER)
    await expect(listKeysForOwner(OWNER)).resolves.toHaveLength(minted)
  })

  it('revokes a key so it stops verifying immediately', async () => {
    const { key, record } = await mintKey(OWNER, 'my agent')

    await expect(revokeKey(record.keyId, OWNER)).resolves.toBe(true)
    await expect(verifyKey(key)).resolves.toEqual({
      ok: false,
      reason: 'unknown',
    })
    await expect(listKeysForOwner(OWNER)).resolves.toEqual([])
  })

  it('refuses to revoke a key belonging to another owner', async () => {
    const { key, record } = await mintKey(OWNER, 'my agent')

    await expect(revokeKey(record.keyId, OTHER)).resolves.toBe(false)
    await expect(verifyKey(key)).resolves.toMatchObject({ ok: true })
  })

  it('frees a slot after a revoke', async () => {
    const first = await mintKey(OWNER, 'a')
    await mintKey(OWNER, 'b')
    await revokeKey(first.record.keyId, OWNER)

    await expect(mintKey(OWNER, 'c')).resolves.toBeTruthy()
  })

  it('throws when the pepper is not configured', async () => {
    delete process.env.FAUCET_API_KEY_PEPPER
    await expect(mintKey(OWNER, 'x')).rejects.toThrow(/FAUCET_API_KEY_PEPPER/)
  })
})

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { ApiKeyRecord, KEY_TTL_DAYS, MAX_KEYS_PER_OWNER } from 'types'
import { getRedis } from './redis'

/**
 * Self-serve API keys for programmatic faucet access.
 *
 * A key is a second way to present a GitHub identity the faucet already
 * understands, not a new trust tier: keyed requests share the owner's existing
 * per-identity rate-limit bucket, so minting a key buys captcha bypass and
 * never extra funds.
 */

const KEY_PREFIX = 'cfk'
const SECRET_BYTES = 32
const KEY_ID_BYTES = 6
export const KEY_TTL_SECONDS = KEY_TTL_DAYS * 24 * 60 * 60

const NAMESPACE = 'api-keys'
const INDEX_KEY = `${NAMESPACE}:index`
const DISABLED_KEY = `${NAMESPACE}:disabled`

export type VerifyResult =
  | { ok: true; keyId: string; ownerHash: string }
  | { ok: false; reason: 'malformed' | 'unknown' | 'disabled' }

/**
 * `prd` keys must not work against staging and vice versa, which is
 * impossible to retrofit once keys are in the wild.
 */
export function environmentTag(): string {
  return process.env.VERCEL_ENV === 'production' ? 'prd' : 'stg'
}

function pepper(): string {
  const value = process.env.FAUCET_API_KEY_PEPPER
  if (!value) {
    throw new Error('Missing in env: FAUCET_API_KEY_PEPPER')
  }
  return value
}

/**
 * HMAC-SHA256, deliberately not bcrypt/argon2: the secret is 256 bits of
 * CSPRNG output, so there is no dictionary to defend against and a slow KDF
 * would only add latency to every faucet request. The pepper means a dump of
 * the key store alone cannot be used to verify keys offline.
 */
function hashKey(presented: string): string {
  return createHmac('sha256', pepper()).update(presented).digest('hex')
}

function recordKey(hash: string): string {
  return `${NAMESPACE}:${hash}`
}

function ownerKey(ownerHash: string): string {
  return `${NAMESPACE}:owner:${ownerHash}`
}

// Anchored rather than split on '_', because the base64url secret may itself
// contain underscores. Every segment has a fixed length, so the match is
// unambiguous.
const KEY_PATTERN = new RegExp(
  `^${KEY_PREFIX}_(prd|stg)_([0-9a-f]{${KEY_ID_BYTES * 2}})_[A-Za-z0-9_-]{43}$`,
)

/** Shape check only; says nothing about whether the key exists. */
export function parseKey(
  presented: string,
): { keyId: string; tag: string } | undefined {
  const match = KEY_PATTERN.exec(presented)
  if (!match) return undefined
  return { keyId: match[2], tag: match[1] }
}

export async function mintKey(
  ownerHash: string,
  label: string,
): Promise<{ key: string; record: ApiKeyRecord }> {
  const redis = getRedis()

  const existing = await listKeysForOwner(ownerHash)
  if (existing.length >= MAX_KEYS_PER_OWNER) {
    throw new Error(
      `You already have ${MAX_KEYS_PER_OWNER} active keys. Revoke one first.`,
    )
  }

  const keyId = randomBytes(KEY_ID_BYTES).toString('hex')
  const secret = randomBytes(SECRET_BYTES).toString('base64url')
  const key = `${KEY_PREFIX}_${environmentTag()}_${keyId}_${secret}`

  const now = Date.now()
  const record: ApiKeyRecord = {
    keyId,
    label: label.slice(0, 60),
    ownerHash,
    createdAt: now,
    expiresAt: now + KEY_TTL_SECONDS * 1000,
  }

  const hash = hashKey(key)
  const tx = redis.multi()
  tx.hset(recordKey(hash), record as unknown as Record<string, unknown>)
  tx.expire(recordKey(hash), KEY_TTL_SECONDS)
  // Without the index an operator who no longer holds the raw secret cannot
  // compute the hash, and therefore cannot revoke the key.
  tx.hset(INDEX_KEY, { [keyId]: hash })
  tx.sadd(ownerKey(ownerHash), keyId)
  tx.expire(ownerKey(ownerHash), KEY_TTL_SECONDS)
  await tx.exec()

  // The cap check above is check-then-act, so two concurrent mints can both
  // pass it. Re-read the authoritative count and roll this key back if it
  // put the owner over. Extra keys grant no extra quota, but the cap should
  // still hold.
  if ((await redis.scard(ownerKey(ownerHash))) > MAX_KEYS_PER_OWNER) {
    await revokeKey(keyId, ownerHash)
    throw new Error(
      `You already have ${MAX_KEYS_PER_OWNER} active keys. Revoke one first.`,
    )
  }

  return { key, record }
}

export async function verifyKey(presented: string): Promise<VerifyResult> {
  const parsed = parseKey(presented)
  if (!parsed || parsed.tag !== environmentTag()) {
    return { ok: false, reason: 'malformed' }
  }

  const redis = getRedis()
  const hash = hashKey(presented)

  // Fetched together so the kill switch costs no extra round trip.
  const [disabled, record] = await Promise.all([
    redis.get<string>(DISABLED_KEY),
    redis.hgetall<Record<string, string>>(recordKey(hash)),
  ])

  if (disabled) {
    return { ok: false, reason: 'disabled' }
  }
  if (!record || !record.keyId) {
    return { ok: false, reason: 'unknown' }
  }

  // The keyId inside the presented token is untrusted; the stored record is
  // authoritative. Compared defensively in case a record is ever written by
  // something other than mintKey.
  const presentedId = Buffer.from(parsed.keyId)
  const storedId = Buffer.from(record.keyId)
  if (
    presentedId.length !== storedId.length ||
    !timingSafeEqual(presentedId, storedId)
  ) {
    return { ok: false, reason: 'unknown' }
  }

  if (Number(record.expiresAt) <= Date.now()) {
    return { ok: false, reason: 'unknown' }
  }

  return { ok: true, keyId: record.keyId, ownerHash: record.ownerHash }
}

export async function listKeysForOwner(
  ownerHash: string,
): Promise<ApiKeyRecord[]> {
  const redis = getRedis()
  const keyIds = await redis.smembers(ownerKey(ownerHash))
  if (!keyIds.length) return []

  const hashes = await redis.hmget<Record<string, string>>(INDEX_KEY, ...keyIds)
  const records = await Promise.all(
    keyIds.map(async (keyId) => {
      const hash = hashes?.[keyId]
      if (!hash) return undefined
      return redis.hgetall<Record<string, string>>(recordKey(hash))
    }),
  )

  const live: ApiKeyRecord[] = []
  const stale: string[] = []
  keyIds.forEach((keyId, i) => {
    const record = records[i]
    if (record?.keyId && Number(record.expiresAt) > Date.now()) {
      live.push({
        keyId: record.keyId,
        label: record.label,
        ownerHash: record.ownerHash,
        createdAt: Number(record.createdAt),
        expiresAt: Number(record.expiresAt),
      })
    } else {
      // Records expire via their own TTL; the owner set has to be tidied here.
      stale.push(keyId)
    }
  })

  if (stale.length) {
    await Promise.all([
      redis.srem(ownerKey(ownerHash), ...stale),
      redis.hdel(INDEX_KEY, ...stale),
    ])
  }

  return live.sort((a, b) => b.createdAt - a.createdAt)
}

/** Returns false when the key does not exist or belongs to someone else. */
export async function revokeKey(
  keyId: string,
  ownerHash: string,
): Promise<boolean> {
  const redis = getRedis()
  const hash = await redis.hget<string>(INDEX_KEY, keyId)
  if (!hash) return false

  const record = await redis.hgetall<Record<string, string>>(recordKey(hash))
  if (!record || record.ownerHash !== ownerHash) return false

  await Promise.all([
    redis.del(recordKey(hash)),
    redis.hdel(INDEX_KEY, keyId),
    redis.srem(ownerKey(ownerHash), keyId),
  ])
  return true
}

import { randomBytes } from 'node:crypto'
import {
  Address,
  createPublicClient,
  fallback,
  Hex,
  http,
  sha256,
  toHex,
  zeroAddress,
} from 'viem'
import { celo } from 'viem/chains'
import { getRedis } from './redis'

/**
 * Agent-held identity, as a second way to prove who is asking.
 *
 * The faucet's only notion of identity was a GitHub account, which is a human
 * one. An agent cannot hold a GitHub account, so it had to borrow its
 * operator's: a key was minted in a browser and pasted into a config file, and
 * the faucet could not tell one agent from another, or an agent from the
 * person running it.
 *
 * ERC-8004 gives an agent an identity of its own. Proving control of the
 * wallet registered against an agent id is therefore enough to mint a key,
 * with no browser, no OAuth round trip and no human.
 */

/** ERC-8004 Identity Registry, Celo mainnet. */
export const IDENTITY_REGISTRY_ADDRESS =
  '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432'

/**
 * Mainnet, deliberately. Registering on Celo Sepolia costs Sepolia gas, which
 * is what this faucet hands out — pointing at a testnet registry would let an
 * attacker faucet its way to as many identities as it wanted.
 */
export const IDENTITY_REGISTRY_CHAIN_ID = celo.id

const identityRegistryAbi = [
  {
    name: 'getAgentWallet',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [{ type: 'address' }],
  },
] as const

// Same shape as the clients in firebase.serverside.ts: an operator-supplied
// endpoint first, with a public one behind it so a missing variable degrades
// rather than breaks.
const registryClient = createPublicClient({
  transport: fallback([
    ...(process.env.CELO_RPC_URL ? [http(process.env.CELO_RPC_URL)] : []),
    http('https://forno.celo.org'),
  ]),
  chain: celo,
})

const CHALLENGE_TTL_SECONDS = 5 * 60
/** Bounds RPC calls when something hammers the challenge endpoint. */
const WALLET_CACHE_TTL_SECONDS = 5 * 60

const CHALLENGE_NAMESPACE = 'agent-challenge'
const WALLET_NAMESPACE = 'agent-wallet'
const REGISTERED_AT_NAMESPACE = 'agent-registered-at'

export const AGENT_DOMAIN = 'faucet.celo.org'

/**
 * What a challenge authorises. Named in the signed text so a signature
 * collected for a mint cannot be presented to revoke, or the other way round.
 */
export type ChallengeAction = 'mint' | 'revoke'
export const CHALLENGE_ACTIONS: readonly ChallengeAction[] = ['mint', 'revoke']

export function parseChallengeAction(
  raw: unknown,
): ChallengeAction | undefined {
  if (raw === undefined || raw === null || raw === '') return 'mint'
  return CHALLENGE_ACTIONS.includes(raw as ChallengeAction)
    ? (raw as ChallengeAction)
    : undefined
}

/** Agent ids are token ids: a non-negative integer, given as a decimal string. */
export function parseAgentId(raw: unknown): bigint | undefined {
  if (typeof raw !== 'string' && typeof raw !== 'number') return undefined
  const text = String(raw).trim()
  if (!/^[0-9]{1,78}$/.test(text)) return undefined
  try {
    return BigInt(text)
  } catch {
    return undefined
  }
}

/**
 * Rate-limit bucket for an agent.
 *
 * Namespaced with a prefix the GitHub path cannot produce — that one hashes a
 * bare email address — so an agent can never land in a human's bucket, and the
 * two kinds of identity stay accountable separately.
 */
export function agentOwnerHash(agentId: bigint): string {
  return sha256(
    toHex(`agent:${IDENTITY_REGISTRY_CHAIN_ID}:${agentId.toString()}`),
  )
}

/**
 * The wallet the agent itself acts with.
 *
 * Returns undefined when the registry holds the zero address, which is what an
 * unregistered id returns as well as a registered agent whose wallet was
 * cleared on transfer. Deliberately does not fall back to `ownerOf`: that is
 * whoever holds the NFT, often a human or a multisig, so accepting it would
 * authenticate the operator while reporting an agent, which is the precise
 * confusion this path exists to remove.
 *
 * An RPC failure propagates. Swallowing it and caching "no wallet" turned a
 * registry outage into five minutes of confident 404s, and left the 503 in the
 * challenge route unreachable from the registry side.
 *
 * `fresh` skips the cached value. The mint and revoke paths use it so that a
 * wallet rotated or cleared in the registry stops authorising at once, rather
 * than for up to the cache window. The challenge route, which is open and
 * cheap to hit, keeps the cache.
 */
export async function resolveAgentWallet(
  agentId: bigint,
  { fresh = false }: { fresh?: boolean } = {},
): Promise<Address | undefined> {
  const redis = getRedis()
  const cacheKey = `${WALLET_NAMESPACE}:${IDENTITY_REGISTRY_CHAIN_ID}:${agentId}`

  if (!fresh) {
    const cached = await redis.get<string>(cacheKey)
    if (cached) {
      return cached === zeroAddress ? undefined : (cached as Address)
    }
  }

  const wallet = await registryClient.readContract({
    address: IDENTITY_REGISTRY_ADDRESS,
    abi: identityRegistryAbi,
    functionName: 'getAgentWallet',
    args: [agentId],
  })

  // Only a real answer from the chain is cached, zero included.
  await redis.set(cacheKey, wallet, { ex: WALLET_CACHE_TTL_SECONDS })
  return wallet === zeroAddress ? undefined : wallet
}

const BLOCKSCOUT_API = 'https://celo.blockscout.com/api/v2'
const REGISTERED_AT_TIMEOUT_MS = 5_000

/**
 * When the agent was registered, as a unix millisecond timestamp.
 *
 * Read from the token's mint transfer on Blockscout: the public RPC refuses
 * `eth_getLogs` over any useful range, and the registry keeps no timestamp.
 * The answer never changes once known, so it is cached without expiry.
 * Returns undefined when it cannot be determined, and callers treat an agent
 * of unknown age as new, which is the conservative reading.
 */
export async function resolveAgentRegisteredAt(
  agentId: bigint,
): Promise<number | undefined> {
  const redis = getRedis()
  const cacheKey = `${REGISTERED_AT_NAMESPACE}:${IDENTITY_REGISTRY_CHAIN_ID}:${agentId}`

  const cached = await redis.get<string | number>(cacheKey)
  if (cached) {
    const value = Number(cached)
    if (Number.isFinite(value) && value > 0) return value
  }

  let registeredAt: number | undefined
  try {
    const res = await fetch(
      `${BLOCKSCOUT_API}/tokens/${IDENTITY_REGISTRY_ADDRESS}/instances/${agentId}/transfers`,
      { signal: AbortSignal.timeout(REGISTERED_AT_TIMEOUT_MS) },
    )
    if (res.ok) {
      const body = (await res.json()) as {
        items?: { timestamp?: string; from?: { hash?: string } }[]
      }
      const mint = body.items?.find(
        (item) => item.from?.hash?.toLowerCase() === zeroAddress,
      )
      const parsed = mint?.timestamp ? Date.parse(mint.timestamp) : NaN
      if (Number.isFinite(parsed)) registeredAt = parsed
    }
  } catch (error) {
    console.warn('Could not read agent registration time', error)
  }

  if (registeredAt !== undefined) {
    await redis.set(cacheKey, registeredAt)
  }
  return registeredAt
}

export function challengeMessage(
  agentId: bigint,
  nonce: string,
  expiresAt: number,
  action: ChallengeAction = 'mint',
): string {
  // Carries the domain, the chain and the registry so a signature collected
  // here cannot be replayed against another service that also asks an agent to
  // sign, the action so a mint signature cannot revoke or vice versa, and an
  // expiry so a captured one does not stay useful.
  return [
    `${AGENT_DOMAIN} wants you to prove control of an ERC-8004 agent.`,
    '',
    `Action: ${action}`,
    `Agent ID: ${agentId.toString()}`,
    `Registry: ${IDENTITY_REGISTRY_ADDRESS}`,
    `Chain ID: ${IDENTITY_REGISTRY_CHAIN_ID}`,
    `Nonce: ${nonce}`,
    `Expires At: ${new Date(expiresAt).toISOString()}`,
  ].join('\n')
}

interface StoredChallenge {
  expiresAt: number
  action: ChallengeAction
}

export async function createChallenge(
  agentId: bigint,
  action: ChallengeAction = 'mint',
): Promise<{
  message: string
  nonce: string
  expiresAt: number
  action: ChallengeAction
}> {
  const nonce = randomBytes(16).toString('hex')
  const expiresAt = Date.now() + CHALLENGE_TTL_SECONDS * 1000

  // Keyed by nonce rather than by agent, so issuing a second challenge does
  // not invalidate one already in flight.
  const stored: StoredChallenge = { expiresAt, action }
  await getRedis().set(
    `${CHALLENGE_NAMESPACE}:${IDENTITY_REGISTRY_CHAIN_ID}:${agentId}:${nonce}`,
    JSON.stringify(stored),
    { ex: CHALLENGE_TTL_SECONDS },
  )

  return {
    message: challengeMessage(agentId, nonce, expiresAt, action),
    nonce,
    expiresAt,
    action,
  }
}

/**
 * Single-use. Uses GETDEL so two requests presenting the same signature cannot
 * both win — the loser sees a missing nonce. Callers must consume before
 * minting, never after: the mint-race fix in tests/mint-race.test.ts is the
 * same class of bug read from the other direction.
 *
 * The stored expiry is checked against the clock as well as relying on the
 * Redis TTL, so a challenge is never honoured past the time printed in it.
 */
export async function consumeChallenge(
  agentId: bigint,
  nonce: string,
  now = Date.now(),
): Promise<StoredChallenge | undefined> {
  if (!/^[0-9a-f]{32}$/.test(nonce)) return undefined
  const raw = await getRedis().getdel<string | StoredChallenge>(
    `${CHALLENGE_NAMESPACE}:${IDENTITY_REGISTRY_CHAIN_ID}:${agentId}:${nonce}`,
  )
  if (!raw) return undefined

  let stored: Partial<StoredChallenge>
  try {
    stored = typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch {
    return undefined
  }
  const expiresAt = Number(stored.expiresAt)
  const action = parseChallengeAction(stored.action)
  if (!Number.isFinite(expiresAt) || !action) return undefined
  if (expiresAt <= now) return undefined
  return { expiresAt, action }
}

/**
 * Verified through the public client rather than viem's standalone helper, so
 * an agent wallet that is a smart account verifies through ERC-1271 as well as
 * a plain EOA. Smart accounts are common for agents that hold funds.
 */
export async function verifyAgentSignature(
  wallet: Address,
  message: string,
  signature: Hex,
): Promise<boolean> {
  try {
    return await registryClient.verifyMessage({
      address: wallet,
      message,
      signature,
    })
  } catch {
    return false
  }
}

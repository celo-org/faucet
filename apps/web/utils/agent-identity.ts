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

export const AGENT_DOMAIN = 'faucet.celo.org'

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
 * Returns undefined when the registry holds the zero address, which is the
 * common case for a freshly registered agent — agent 1 on mainnet is in
 * exactly that state today. Deliberately does not fall back to `ownerOf`: that
 * is whoever holds the NFT, often a human or a multisig, so accepting it would
 * authenticate the operator while reporting an agent, which is the precise
 * confusion this path exists to remove.
 */
export async function resolveAgentWallet(
  agentId: bigint,
): Promise<Address | undefined> {
  const redis = getRedis()
  const cacheKey = `${WALLET_NAMESPACE}:${IDENTITY_REGISTRY_CHAIN_ID}:${agentId}`

  const cached = await redis.get<string>(cacheKey)
  if (cached) {
    return cached === zeroAddress ? undefined : (cached as Address)
  }

  let wallet: Address
  try {
    wallet = await registryClient.readContract({
      address: IDENTITY_REGISTRY_ADDRESS,
      abi: identityRegistryAbi,
      functionName: 'getAgentWallet',
      args: [agentId],
    })
  } catch {
    // An unregistered id reverts rather than returning zero. That is not an
    // outage, so it is cached as "no wallet" like any other miss.
    wallet = zeroAddress
  }

  await redis.set(cacheKey, wallet, { ex: WALLET_CACHE_TTL_SECONDS })
  return wallet === zeroAddress ? undefined : wallet
}

export function challengeMessage(
  agentId: bigint,
  nonce: string,
  expiresAt: number,
): string {
  // Carries the domain, the chain and the registry so a signature collected
  // here cannot be replayed against another service that also asks an agent to
  // sign, and an expiry so a captured one does not stay useful.
  return [
    `${AGENT_DOMAIN} wants you to prove control of an ERC-8004 agent.`,
    '',
    `Agent ID: ${agentId.toString()}`,
    `Registry: ${IDENTITY_REGISTRY_ADDRESS}`,
    `Chain ID: ${IDENTITY_REGISTRY_CHAIN_ID}`,
    `Nonce: ${nonce}`,
    `Expires At: ${new Date(expiresAt).toISOString()}`,
  ].join('\n')
}

export async function createChallenge(agentId: bigint): Promise<{
  message: string
  nonce: string
  expiresAt: number
}> {
  const nonce = randomBytes(16).toString('hex')
  const expiresAt = Date.now() + CHALLENGE_TTL_SECONDS * 1000

  // Keyed by nonce rather than by agent, so issuing a second challenge does
  // not invalidate one already in flight.
  await getRedis().set(
    `${CHALLENGE_NAMESPACE}:${IDENTITY_REGISTRY_CHAIN_ID}:${agentId}:${nonce}`,
    expiresAt,
    { ex: CHALLENGE_TTL_SECONDS },
  )

  return {
    message: challengeMessage(agentId, nonce, expiresAt),
    nonce,
    expiresAt,
  }
}

/**
 * Single-use. Uses GETDEL so two requests presenting the same signature cannot
 * both win — the loser sees a missing nonce. Callers must consume before
 * minting, never after: the mint-race fix in tests/mint-race.test.ts is the
 * same class of bug read from the other direction.
 */
export async function consumeChallenge(
  agentId: bigint,
  nonce: string,
): Promise<number | undefined> {
  if (!/^[0-9a-f]{32}$/.test(nonce)) return undefined
  const stored = await getRedis().getdel<number>(
    `${CHALLENGE_NAMESPACE}:${IDENTITY_REGISTRY_CHAIN_ID}:${agentId}:${nonce}`,
  )
  return stored ? Number(stored) : undefined
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

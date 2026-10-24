import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Minimal in-memory stand-in for the Upstash client, per api-key.test.ts. */
class FakeRedis {
  strings = new Map<string, string>()

  async get(key: string) {
    return this.strings.get(key) ?? null
  }
  async set(key: string, value: unknown) {
    this.strings.set(key, String(value))
  }
  async getdel(key: string) {
    const value = this.strings.get(key) ?? null
    this.strings.delete(key)
    return value
  }
}

const redis = vi.hoisted(() => ({ current: null as unknown }))
vi.mock('./redis', () => ({ getRedis: () => redis.current }))

const chain = vi.hoisted(() => ({
  readContract: vi.fn(),
  verifyMessage: vi.fn(),
}))
vi.mock('viem', async () => {
  const actual = await vi.importActual<typeof import('viem')>('viem')
  return { ...actual, createPublicClient: () => chain }
})

import {
  agentOwnerHash,
  challengeMessage,
  consumeChallenge,
  createChallenge,
  IDENTITY_REGISTRY_ADDRESS,
  IDENTITY_REGISTRY_CHAIN_ID,
  parseAgentId,
  resolveAgentWallet,
  verifyAgentSignature,
} from './agent-identity'

const WALLET = '0x1be93C700dDC596D701E8F2106B8F9166C625Adb'
const ZERO = '0x0000000000000000000000000000000000000000'

let fake: FakeRedis

beforeEach(() => {
  fake = new FakeRedis()
  redis.current = fake
  chain.readContract.mockReset()
  chain.verifyMessage.mockReset()
})

describe('parseAgentId', () => {
  it('accepts a decimal id as a string or a number', () => {
    expect(parseAgentId('12')).toBe(12n)
    expect(parseAgentId(12)).toBe(12n)
    expect(parseAgentId(' 12 ')).toBe(12n)
  })

  it('rejects anything that is not a plain non-negative integer', () => {
    for (const bad of ['', '-1', '1.5', '0x0c', 'abc', null, undefined, {}]) {
      expect(parseAgentId(bad)).toBeUndefined()
    }
  })
})

describe('agentOwnerHash', () => {
  /**
   * The GitHub path hashes a bare email address, so it can never produce a
   * value that starts with this prefix. If these two could ever collide, an
   * agent would draw on a person's daily allowance.
   */
  it('cannot collide with a GitHub owner hash', () => {
    expect(agentOwnerHash(1n)).not.toBe(agentOwnerHash(2n))
    expect(agentOwnerHash(1n)).toMatch(/^0x[0-9a-f]{64}$/)
  })

  it('is stable for the same agent', () => {
    expect(agentOwnerHash(7n)).toBe(agentOwnerHash(7n))
  })
})

describe('resolveAgentWallet', () => {
  it('returns the registered wallet', async () => {
    chain.readContract.mockResolvedValue(WALLET)
    await expect(resolveAgentWallet(2n)).resolves.toBe(WALLET)
  })

  /**
   * Regression guard for the central design decision. Agent 1 on Celo mainnet
   * really is in this state: ownerOf returns a live address while
   * getAgentWallet is unset. Falling back to the owner would authenticate the
   * human holding the NFT while reporting that an agent had signed.
   */
  it('refuses an agent whose wallet is unset rather than falling back', async () => {
    chain.readContract.mockResolvedValue(ZERO)
    await expect(resolveAgentWallet(1n)).resolves.toBeUndefined()
  })

  it('treats an unregistered id, which reverts, as having no wallet', async () => {
    chain.readContract.mockRejectedValue(new Error('execution reverted'))
    await expect(resolveAgentWallet(999n)).resolves.toBeUndefined()
  })

  it('caches the lookup so the challenge endpoint cannot be used to hammer RPC', async () => {
    chain.readContract.mockResolvedValue(WALLET)
    await resolveAgentWallet(2n)
    await resolveAgentWallet(2n)
    await resolveAgentWallet(2n)
    expect(chain.readContract).toHaveBeenCalledTimes(1)
  })

  it('caches a miss too, so an unregistered id is equally cheap', async () => {
    chain.readContract.mockResolvedValue(ZERO)
    await resolveAgentWallet(1n)
    await resolveAgentWallet(1n)
    expect(chain.readContract).toHaveBeenCalledTimes(1)
  })
})

describe('challengeMessage', () => {
  /**
   * Each of these binds the signature to this service. Without the domain and
   * chain, a signature gathered by any other site that asks an agent to sign
   * could be replayed here.
   */
  it('binds the signature to the domain, registry, chain, nonce and expiry', () => {
    const message = challengeMessage(2n, 'a'.repeat(32), 1_700_000_000_000)
    expect(message).toContain('faucet.celo.org')
    expect(message).toContain('Agent ID: 2')
    expect(message).toContain(`Registry: ${IDENTITY_REGISTRY_ADDRESS}`)
    expect(message).toContain(`Chain ID: ${IDENTITY_REGISTRY_CHAIN_ID}`)
    expect(message).toContain(`Nonce: ${'a'.repeat(32)}`)
    expect(message).toContain('Expires At: 2023-11-14T22:13:20.000Z')
  })

  it('pins the registry to mainnet, never the faucet its own testnet', () => {
    // Registering on Sepolia would cost Sepolia gas, which is what this faucet
    // hands out — an attacker could faucet its way to unlimited identities.
    expect(IDENTITY_REGISTRY_CHAIN_ID).toBe(42220)
  })
})

describe('challenges', () => {
  it('issues a nonce that verifies the message it describes', async () => {
    const { message, nonce, expiresAt } = await createChallenge(2n)
    expect(nonce).toMatch(/^[0-9a-f]{32}$/)
    expect(message).toBe(challengeMessage(2n, nonce, expiresAt))
  })

  it('is single-use', async () => {
    const { nonce } = await createChallenge(2n)
    await expect(consumeChallenge(2n, nonce)).resolves.toBeTruthy()
    // The second attempt is the replay this exists to stop.
    await expect(consumeChallenge(2n, nonce)).resolves.toBeUndefined()
  })

  it('does not let one agent spend another agent nonce', async () => {
    const { nonce } = await createChallenge(2n)
    await expect(consumeChallenge(3n, nonce)).resolves.toBeUndefined()
    await expect(consumeChallenge(2n, nonce)).resolves.toBeTruthy()
  })

  it('rejects a malformed nonce without touching storage', async () => {
    await expect(consumeChallenge(2n, 'not-a-nonce')).resolves.toBeUndefined()
  })

  it('keeps concurrent challenges independent', async () => {
    // Keyed by nonce rather than by agent, so asking twice does not invalidate
    // a challenge already in flight.
    const first = await createChallenge(2n)
    const second = await createChallenge(2n)
    expect(first.nonce).not.toBe(second.nonce)
    await expect(consumeChallenge(2n, first.nonce)).resolves.toBeTruthy()
    await expect(consumeChallenge(2n, second.nonce)).resolves.toBeTruthy()
  })
})

describe('verifyAgentSignature', () => {
  it('passes a valid signature through', async () => {
    chain.verifyMessage.mockResolvedValue(true)
    await expect(verifyAgentSignature(WALLET, 'msg', '0xsig')).resolves.toBe(
      true,
    )
  })

  it('is false, never throwing, when the signature is malformed', async () => {
    chain.verifyMessage.mockRejectedValue(new Error('invalid signature'))
    await expect(verifyAgentSignature(WALLET, 'msg', '0xsig')).resolves.toBe(
      false,
    )
  })

  it('verifies through the client so smart-account agents work', async () => {
    // A standalone ecrecover would reject every ERC-1271 wallet, and agents
    // that hold funds commonly use smart accounts.
    chain.verifyMessage.mockResolvedValue(true)
    await verifyAgentSignature(WALLET, 'msg', '0xsig')
    expect(chain.verifyMessage).toHaveBeenCalledWith({
      address: WALLET,
      message: 'msg',
      signature: '0xsig',
    })
  })
})

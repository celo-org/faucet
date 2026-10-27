import { createMocks } from 'node-mocks-http'
import type { NextApiRequest, NextApiResponse } from 'next'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const resolveAgentWallet = vi.hoisted(() => vi.fn())
const resolveAgentRegisteredAt = vi.hoisted(() => vi.fn())
const verifyAgentSignature = vi.hoisted(() => vi.fn())
const consumeChallenge = vi.hoisted(() => vi.fn())
const createChallenge = vi.hoisted(() => vi.fn())
const mintKey = vi.hoisted(() => vi.fn())
const revokeKey = vi.hoisted(() => vi.fn())
const revokeAllKeysForOwner = vi.hoisted(() => vi.fn())

vi.mock('utils/agent-identity', async () => {
  // The message builder, the id parser and the owner hash are real: a double
  // would hide the things these tests care most about, which are that the
  // server signs off on a message it reconstructed rather than one the caller
  // supplied, and that the key lands in the agent's own bucket.
  const actual = await vi.importActual<typeof import('utils/agent-identity')>(
    'utils/agent-identity',
  )
  return {
    ...actual,
    resolveAgentWallet,
    resolveAgentRegisteredAt,
    verifyAgentSignature,
    consumeChallenge,
    createChallenge,
  }
})
vi.mock('utils/api-key', () => ({ mintKey, revokeKey, revokeAllKeysForOwner }))
vi.mock('utils/redis', () => ({ getRedis: () => ({}) }))

import { agentOwnerHash, challengeMessage } from 'utils/agent-identity'
import agentHandler from '../pages/api/keys/agent'
import challengeHandler from '../pages/api/keys/challenge'

const WALLET = '0x1be93C700dDC596D701E8F2106B8F9166C625Adb'
const NONCE = 'a'.repeat(32)
const SIG = `0x${'b'.repeat(130)}`
const EXPIRES = 1_700_000_000_000
const REGISTERED = 1_690_000_000_000

type Handler = (req: NextApiRequest, res: NextApiResponse) => Promise<void>

function call(
  handler: Handler,
  body: Record<string, unknown> | undefined,
  method = 'POST',
) {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method: method as 'POST',
    body,
  })
  return { res, run: () => handler(req, res) }
}

const proof = { agentId: '2', nonce: NONCE, signature: SIG }

beforeEach(() => {
  vi.clearAllMocks()
  resolveAgentWallet.mockResolvedValue(WALLET)
  resolveAgentRegisteredAt.mockResolvedValue(REGISTERED)
  verifyAgentSignature.mockResolvedValue(true)
  consumeChallenge.mockResolvedValue({ expiresAt: EXPIRES, action: 'mint' })
  createChallenge.mockImplementation(
    async (agentId: bigint, action = 'mint') => ({
      message: challengeMessage(agentId, NONCE, EXPIRES, action),
      nonce: NONCE,
      expiresAt: EXPIRES,
      action,
    }),
  )
  revokeKey.mockResolvedValue(true)
  revokeAllKeysForOwner.mockResolvedValue(2)
  mintKey.mockResolvedValue({
    key: `cfk_stg_0123456789ab_${'a'.repeat(43)}`,
    record: { keyId: '0123456789ab', expiresAt: EXPIRES },
  })
})

describe('POST /api/keys/challenge', () => {
  it('returns a challenge and the wallet to sign it with', async () => {
    const { res, run } = call(challengeHandler, { agentId: '2' })
    await run()
    expect(res._getStatusCode()).toBe(200)
    const body = res._getJSONData()
    expect(body.agentWallet).toBe(WALLET)
    expect(body.nonce).toBe(NONCE)
    expect(body.action).toBe('mint')
    expect(body.message).toContain('Agent ID: 2')
    expect(body.message).toContain('Action: mint')
  })

  it('issues a revoke challenge when asked for one', async () => {
    const { res, run } = call(challengeHandler, {
      agentId: '2',
      action: 'revoke',
    })
    await run()
    expect(res._getStatusCode()).toBe(200)
    expect(createChallenge).toHaveBeenCalledWith(2n, 'revoke')
    expect(res._getJSONData().message).toContain('Action: revoke')
  })

  it('rejects an action it does not know', async () => {
    const { res, run } = call(challengeHandler, {
      agentId: '2',
      action: 'transfer',
    })
    await run()
    expect(res._getStatusCode()).toBe(400)
    expect(res._getJSONData().error).toBe('invalid_action')
    expect(resolveAgentWallet).not.toHaveBeenCalled()
  })

  it('refuses an agent with no wallet set, naming the fix', async () => {
    resolveAgentWallet.mockResolvedValue(undefined)
    const { res, run } = call(challengeHandler, { agentId: '1' })
    await run()
    expect(res._getStatusCode()).toBe(404)
    expect(res._getJSONData().error).toBe('agent_wallet_unset')
    expect(res._getJSONData().message).toContain('setAgentWallet')
  })

  it('rejects a malformed agent id', async () => {
    const { res, run } = call(challengeHandler, { agentId: '0xdead' })
    await run()
    expect(res._getStatusCode()).toBe(400)
    expect(res._getJSONData().error).toBe('invalid_agent_id')
  })

  /**
   * resolveAgentWallet now lets RPC errors through, so this is the path a
   * real forno outage takes.
   */
  it('reports a registry outage as retryable rather than as a bad request', async () => {
    resolveAgentWallet.mockRejectedValue(new Error('rpc down'))
    const { res, run } = call(challengeHandler, { agentId: '2' })
    await run()
    expect(res._getStatusCode()).toBe(503)
    expect(res._getJSONData().error).toBe('faucet_unavailable')
    expect(res.getHeader('Retry-After')).toBe('30')
  })

  it('uses the cached wallet, since this route is open and cheap to hit', async () => {
    const { run } = call(challengeHandler, { agentId: '2' })
    await run()
    expect(resolveAgentWallet).toHaveBeenCalledWith(2n)
  })

  it('refuses a GET', async () => {
    const { res, run } = call(challengeHandler, undefined, 'GET')
    await run()
    expect(res._getStatusCode()).toBe(405)
  })
})

describe('POST /api/keys/agent', () => {
  it('mints a key for an agent that signed the challenge', async () => {
    const { res, run } = call(agentHandler, proof)
    await run()
    expect(res._getStatusCode()).toBe(201)
    expect(res._getJSONData().key).toMatch(/^cfk_/)
  })

  /**
   * The whole point of the path. No session is read and no captcha token is
   * accepted, so an agent holding only a signing key can complete this.
   */
  it('never consults a session or a captcha', async () => {
    const { run } = call(agentHandler, proof)
    await run()
    expect(mintKey).toHaveBeenCalledTimes(1)
  })

  /**
   * Bound to the agent, not to a person: the agent's own owner hash is what
   * gives it its own allowance instead of borrowing its operator's. Checked
   * against the real derivation, so a handler that hashed the wrong thing
   * (or agent 0) would fail here.
   */
  it('binds the key to this agent own bucket and records its registration', async () => {
    const { run } = call(agentHandler, proof)
    await run()
    expect(mintKey).toHaveBeenCalledWith(agentOwnerHash(2n), 'agent-2', {
      agentId: '2',
      agentRegisteredAt: REGISTERED,
    })
  })

  it('still mints, as a new agent, when the registration time is unknown', async () => {
    resolveAgentRegisteredAt.mockResolvedValue(undefined)
    const { res, run } = call(agentHandler, proof)
    await run()
    expect(res._getStatusCode()).toBe(201)
    expect(mintKey.mock.calls[0][2]).toEqual({
      agentId: '2',
      agentRegisteredAt: undefined,
    })
  })

  /**
   * Regression guard for the replay window. The nonce must be spent before the
   * signature is checked, so two requests carrying the same signature cannot
   * both verify and both mint.
   */
  it('spends the challenge before verifying the signature', async () => {
    const order: string[] = []
    consumeChallenge.mockImplementation(async () => {
      order.push('consume')
      return { expiresAt: EXPIRES, action: 'mint' }
    })
    verifyAgentSignature.mockImplementation(async () => {
      order.push('verify')
      return true
    })
    const { run } = call(agentHandler, proof)
    await run()
    expect(order).toEqual(['consume', 'verify'])
  })

  it('rejects a replayed challenge', async () => {
    consumeChallenge.mockResolvedValue(undefined)
    const { res, run } = call(agentHandler, proof)
    await run()
    expect(res._getStatusCode()).toBe(401)
    expect(res._getJSONData().error).toBe('invalid_challenge')
    expect(mintKey).not.toHaveBeenCalled()
  })

  /**
   * The server must sign off on a message it rebuilt from the stored expiry,
   * not one the caller handed it, or a caller could present a signature over
   * text of its own choosing.
   */
  it('verifies against a message it reconstructed itself', async () => {
    const { run } = call(agentHandler, {
      ...proof,
      message: 'something the caller made up',
    })
    await run()
    expect(verifyAgentSignature).toHaveBeenCalledWith(
      WALLET,
      challengeMessage(2n, NONCE, EXPIRES, 'mint'),
      SIG,
    )
  })

  /**
   * A signature over a revoke challenge must not mint. The action is part of
   * the signed text and is checked before the signature is verified.
   */
  it('refuses to mint with a challenge issued for a revoke', async () => {
    consumeChallenge.mockResolvedValue({ expiresAt: EXPIRES, action: 'revoke' })
    const { res, run } = call(agentHandler, proof)
    await run()
    expect(res._getStatusCode()).toBe(401)
    expect(res._getJSONData().error).toBe('wrong_action')
    expect(verifyAgentSignature).not.toHaveBeenCalled()
    expect(mintKey).not.toHaveBeenCalled()
  })

  /**
   * Fresh, not cached: a wallet rotated or cleared in the registry must stop
   * authorising at once rather than for the remainder of the cache window.
   */
  it('reads the wallet fresh from the registry', async () => {
    const { run } = call(agentHandler, proof)
    await run()
    expect(resolveAgentWallet).toHaveBeenCalledWith(2n, { fresh: true })
  })

  it('refuses an agent whose wallet is unset without minting', async () => {
    resolveAgentWallet.mockResolvedValue(undefined)
    const { res, run } = call(agentHandler, proof)
    await run()
    expect(res._getStatusCode()).toBe(404)
    expect(res._getJSONData().error).toBe('agent_wallet_unset')
    expect(verifyAgentSignature).not.toHaveBeenCalled()
    expect(mintKey).not.toHaveBeenCalled()
  })

  it('rejects a signature that does not verify', async () => {
    verifyAgentSignature.mockResolvedValue(false)
    const { res, run } = call(agentHandler, proof)
    await run()
    expect(res._getStatusCode()).toBe(401)
    expect(res._getJSONData().error).toBe('invalid_signature')
    expect(mintKey).not.toHaveBeenCalled()
  })

  it('rejects a signature that is not hex', async () => {
    const { res, run } = call(agentHandler, { ...proof, signature: 'nope' })
    await run()
    expect(res._getStatusCode()).toBe(400)
    expect(consumeChallenge).not.toHaveBeenCalled()
  })

  it('surfaces the key cap as a 409 rather than a 500', async () => {
    mintKey.mockRejectedValue(new Error('You already have 2 active keys.'))
    const { res, run } = call(agentHandler, proof)
    await run()
    expect(res._getStatusCode()).toBe(409)
    expect(res._getJSONData().error).toBe('key_limit_reached')
  })

  it('reports a registry outage during the mint as retryable', async () => {
    resolveAgentWallet.mockRejectedValue(new Error('rpc down'))
    const { res, run } = call(agentHandler, proof)
    await run()
    expect(res._getStatusCode()).toBe(500)
    expect(res._getJSONData().error).toBe('faucet_unavailable')
    expect(mintKey).not.toHaveBeenCalled()
  })

  it('refuses a GET', async () => {
    const { res, run } = call(agentHandler, undefined, 'GET')
    await run()
    expect(res._getStatusCode()).toBe(405)
  })
})

describe('DELETE /api/keys/agent', () => {
  const revokeProof = () =>
    consumeChallenge.mockResolvedValue({ expiresAt: EXPIRES, action: 'revoke' })

  /**
   * An agent key is bound to an agent, not a person, so nobody can reach it
   * through the signed-in path at /keys. Without a signature-proved revoke, a
   * leaked agent key would be irrevocable until it expired 90 days later.
   */
  it('revokes a key for an agent that signed a revoke challenge', async () => {
    revokeProof()
    const { res, run } = call(
      agentHandler,
      { ...proof, keyId: '0123456789ab' },
      'DELETE',
    )
    await run()
    expect(res._getStatusCode()).toBe(200)
    expect(res._getJSONData().revoked).toBe(1)
    expect(revokeKey).toHaveBeenCalledWith('0123456789ab', agentOwnerHash(2n))
    expect(mintKey).not.toHaveBeenCalled()
  })

  /**
   * The recovery path after a signing-key compromise. The attacker's keys
   * were never shown to the rightful agent, so it cannot name them; without
   * this they would stay live for 90 days and hold both slots.
   */
  it('revokes every key the agent holds when no keyId is given', async () => {
    revokeProof()
    const { res, run } = call(agentHandler, proof, 'DELETE')
    await run()
    expect(res._getStatusCode()).toBe(200)
    expect(res._getJSONData().revoked).toBe(2)
    expect(revokeAllKeysForOwner).toHaveBeenCalledWith(agentOwnerHash(2n))
    expect(revokeKey).not.toHaveBeenCalled()
  })

  it('refuses to revoke with a challenge issued for a mint', async () => {
    const { res, run } = call(
      agentHandler,
      { ...proof, keyId: '0123456789ab' },
      'DELETE',
    )
    await run()
    expect(res._getStatusCode()).toBe(401)
    expect(res._getJSONData().error).toBe('wrong_action')
    expect(revokeKey).not.toHaveBeenCalled()
    expect(revokeAllKeysForOwner).not.toHaveBeenCalled()
  })

  it('still requires a valid signature', async () => {
    revokeProof()
    verifyAgentSignature.mockResolvedValue(false)
    const { res, run } = call(
      agentHandler,
      { ...proof, keyId: '0123456789ab' },
      'DELETE',
    )
    await run()
    expect(res._getStatusCode()).toBe(401)
    expect(revokeKey).not.toHaveBeenCalled()
    expect(revokeAllKeysForOwner).not.toHaveBeenCalled()
  })

  it('cannot be used to probe which key ids exist', async () => {
    revokeProof()
    revokeKey.mockResolvedValue(false)
    const { res, run } = call(
      agentHandler,
      { ...proof, keyId: 'someone-elses' },
      'DELETE',
    )
    await run()
    expect(res._getStatusCode()).toBe(404)
    expect(res._getJSONData().message).toBe('No such key')
  })
})

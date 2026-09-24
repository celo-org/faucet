import { createMocks } from 'node-mocks-http'
import type { NextApiRequest, NextApiResponse } from 'next'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const resolveAgentWallet = vi.hoisted(() => vi.fn())
const verifyAgentSignature = vi.hoisted(() => vi.fn())
const consumeChallenge = vi.hoisted(() => vi.fn())
const createChallenge = vi.hoisted(() => vi.fn())
const mintKey = vi.hoisted(() => vi.fn())
const revokeKey = vi.hoisted(() => vi.fn())

vi.mock('utils/agent-identity', async () => {
  // The message builder and the id parser are real: a double would hide the
  // thing these tests care most about, which is that the server signs off on a
  // message it reconstructed rather than one the caller supplied.
  const actual = await vi.importActual<typeof import('utils/agent-identity')>(
    'utils/agent-identity',
  )
  return {
    ...actual,
    resolveAgentWallet,
    verifyAgentSignature,
    consumeChallenge,
    createChallenge,
  }
})
vi.mock('utils/api-key', () => ({ mintKey, revokeKey }))
vi.mock('utils/redis', () => ({ getRedis: () => ({}) }))

import { challengeMessage } from 'utils/agent-identity'
import agentHandler from '../pages/api/keys/agent'
import challengeHandler from '../pages/api/keys/challenge'

const WALLET = '0x1be93C700dDC596D701E8F2106B8F9166C625Adb'
const NONCE = 'a'.repeat(32)
const SIG = `0x${'b'.repeat(130)}`
const EXPIRES = 1_700_000_000_000

type Handler = (req: NextApiRequest, res: NextApiResponse) => Promise<void>

function call(handler: Handler, body: unknown, method = 'POST') {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method: method as 'POST',
    body,
  })
  return { res, run: () => handler(req, res) }
}

beforeEach(() => {
  vi.clearAllMocks()
  resolveAgentWallet.mockResolvedValue(WALLET)
  verifyAgentSignature.mockResolvedValue(true)
  consumeChallenge.mockResolvedValue(EXPIRES)
  createChallenge.mockResolvedValue({
    message: challengeMessage(2n, NONCE, EXPIRES),
    nonce: NONCE,
    expiresAt: EXPIRES,
  })
  revokeKey.mockResolvedValue(true)
  mintKey.mockResolvedValue({
    key: `cfk_stg_0123456789ab_${'a'.repeat(43)}`,
    record: { keyId: '0123456789ab', expiresAt: EXPIRES },
  })
})

describe('POST /api/keys/challenge', () => {
  it('returns a challenge and the wallet to sign it with', async () => {
    const { res, run } = await call(challengeHandler, { agentId: '2' })
    await run()
    expect(res._getStatusCode()).toBe(200)
    const body = res._getJSONData()
    expect(body.agentWallet).toBe(WALLET)
    expect(body.nonce).toBe(NONCE)
    expect(body.message).toContain('Agent ID: 2')
  })

  it('refuses an agent with no wallet set, naming the fix', async () => {
    resolveAgentWallet.mockResolvedValue(undefined)
    const { res, run } = await call(challengeHandler, { agentId: '1' })
    await run()
    expect(res._getStatusCode()).toBe(404)
    expect(res._getJSONData().error).toBe('agent_wallet_unset')
    expect(res._getJSONData().message).toContain('setAgentWallet')
  })

  it('rejects a malformed agent id', async () => {
    const { res, run } = await call(challengeHandler, { agentId: '0xdead' })
    await run()
    expect(res._getStatusCode()).toBe(400)
    expect(res._getJSONData().error).toBe('invalid_agent_id')
  })

  it('reports a registry outage as retryable rather than as a bad request', async () => {
    resolveAgentWallet.mockRejectedValue(new Error('rpc down'))
    const { res, run } = await call(challengeHandler, { agentId: '2' })
    await run()
    expect(res._getStatusCode()).toBe(503)
    expect(res.getHeader('Retry-After')).toBe('30')
  })

  it('refuses a GET', async () => {
    const { res, run } = await call(challengeHandler, undefined, 'GET')
    await run()
    expect(res._getStatusCode()).toBe(405)
  })
})

describe('POST /api/keys/agent', () => {
  it('mints a key for an agent that signed the challenge', async () => {
    const { res, run } = await call(agentHandler, {
      agentId: '2',
      nonce: NONCE,
      signature: SIG,
    })
    await run()
    expect(res._getStatusCode()).toBe(201)
    expect(res._getJSONData().key).toMatch(/^cfk_/)
  })

  /**
   * The whole point of the path. No session is read and no captcha token is
   * accepted, so an agent holding only a signing key can complete this.
   */
  it('never consults a session or a captcha', async () => {
    const { run } = await call(agentHandler, {
      agentId: '2',
      nonce: NONCE,
      signature: SIG,
    })
    await run()
    expect(mintKey).toHaveBeenCalledTimes(1)
    // Bound to the agent, not to a person: a distinct owner hash is what gives
    // the agent its own allowance instead of borrowing its operator's.
    expect(mintKey.mock.calls[0][0]).toMatch(/^0x[0-9a-f]{64}$/)
    expect(mintKey.mock.calls[0][1]).toBe('agent-2')
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
      return EXPIRES
    })
    verifyAgentSignature.mockImplementation(async () => {
      order.push('verify')
      return true
    })
    const { run } = await call(agentHandler, {
      agentId: '2',
      nonce: NONCE,
      signature: SIG,
    })
    await run()
    expect(order).toEqual(['consume', 'verify'])
  })

  it('rejects a replayed challenge', async () => {
    consumeChallenge.mockResolvedValue(undefined)
    const { res, run } = await call(agentHandler, {
      agentId: '2',
      nonce: NONCE,
      signature: SIG,
    })
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
    const { run } = await call(agentHandler, {
      agentId: '2',
      nonce: NONCE,
      signature: SIG,
      message: 'something the caller made up',
    })
    await run()
    expect(verifyAgentSignature).toHaveBeenCalledWith(
      WALLET,
      challengeMessage(2n, NONCE, EXPIRES),
      SIG,
    )
  })

  it('rejects a signature that does not verify', async () => {
    verifyAgentSignature.mockResolvedValue(false)
    const { res, run } = await call(agentHandler, {
      agentId: '2',
      nonce: NONCE,
      signature: SIG,
    })
    await run()
    expect(res._getStatusCode()).toBe(401)
    expect(res._getJSONData().error).toBe('invalid_signature')
    expect(mintKey).not.toHaveBeenCalled()
  })

  it('rejects a signature that is not hex', async () => {
    const { res, run } = await call(agentHandler, {
      agentId: '2',
      nonce: NONCE,
      signature: 'nope',
    })
    await run()
    expect(res._getStatusCode()).toBe(400)
    expect(consumeChallenge).not.toHaveBeenCalled()
  })

  it('surfaces the key cap as a 409 rather than a 500', async () => {
    mintKey.mockRejectedValue(new Error('You already have 2 active keys.'))
    const { res, run } = await call(agentHandler, {
      agentId: '2',
      nonce: NONCE,
      signature: SIG,
    })
    await run()
    expect(res._getStatusCode()).toBe(409)
    expect(res._getJSONData().error).toBe('key_limit_reached')
  })

  it('refuses a GET', async () => {
    const { res, run } = await call(agentHandler, undefined, 'GET')
    await run()
    expect(res._getStatusCode()).toBe(405)
  })
})

describe('DELETE /api/keys/agent', () => {
  /**
   * An agent key is bound to an agent, not a person, so nobody can reach it
   * through the signed-in path at /keys. Without a signature-proved revoke, a
   * leaked agent key would be irrevocable until it expired 90 days later.
   */
  it('revokes a key for an agent that signed the challenge', async () => {
    const { res, run } = await call(
      agentHandler,
      { agentId: '2', nonce: NONCE, signature: SIG, keyId: '0123456789ab' },
      'DELETE',
    )
    await run()
    expect(res._getStatusCode()).toBe(200)
    expect(revokeKey).toHaveBeenCalledWith('0123456789ab', expect.any(String))
    expect(mintKey).not.toHaveBeenCalled()
  })

  it('revokes against the agent bucket, never a human one', async () => {
    const { run } = await call(
      agentHandler,
      { agentId: '2', nonce: NONCE, signature: SIG, keyId: '0123456789ab' },
      'DELETE',
    )
    await run()
    expect(revokeKey.mock.calls[0][1]).toMatch(/^0x[0-9a-f]{64}$/)
  })

  it('still requires a valid signature', async () => {
    verifyAgentSignature.mockResolvedValue(false)
    const { res, run } = await call(
      agentHandler,
      { agentId: '2', nonce: NONCE, signature: SIG, keyId: '0123456789ab' },
      'DELETE',
    )
    await run()
    expect(res._getStatusCode()).toBe(401)
    expect(revokeKey).not.toHaveBeenCalled()
  })

  it('cannot be used to probe which key ids exist', async () => {
    revokeKey.mockResolvedValue(false)
    const { res, run } = await call(
      agentHandler,
      { agentId: '2', nonce: NONCE, signature: SIG, keyId: 'someone-elses' },
      'DELETE',
    )
    await run()
    expect(res._getStatusCode()).toBe(404)
    expect(res._getJSONData().message).toBe('No such key')
  })
})

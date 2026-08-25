import { createMocks } from 'node-mocks-http'
import type { NextApiRequest, NextApiResponse } from 'next'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthLevel, RequestStatus } from 'types'
import { AdmissionChannel } from 'utils/metrics'

const captchaVerify = vi.hoisted(() => vi.fn())
const sendRequest = vi.hoisted(() => vi.fn())
const getServerSession = vi.hoisted(() => vi.fn())
const verifyKey = vi.hoisted(() => vi.fn())

vi.mock('utils/captcha-verify', () => ({ captchaVerify }))
vi.mock('utils/firebase.serverside', () => ({ sendRequest }))
vi.mock('next-auth/next', () => ({ getServerSession }))
vi.mock('utils/api-key', () => ({ verifyKey }))
vi.mock('@vercel/functions', () => ({ ipAddress: () => '203.0.113.7' }))

import handler from '../pages/api/faucet'

const VALID = '0x22579CA45eE22E2E16dDF72D955D6cf4c767B0eF'
const KEY = `cfk_stg_0123456789ab_${'a'.repeat(43)}`

function call(
  body: Record<string, unknown> | undefined,
  {
    method = 'POST',
    authorization,
  }: {
    method?: string
    authorization?: string
  } = {},
) {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method: method as 'POST',
    body,
    headers: authorization ? { authorization } : {},
  })
  return { req, res, run: () => handler(req, res) }
}

const browserBody = {
  captchaToken: 'token',
  beneficiary: VALID,
  network: 'celo-sepolia',
}
/** The key path sends no captchaToken. */
const keyedBody = { beneficiary: VALID, network: 'celo-sepolia' }

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue(null)
  captchaVerify.mockResolvedValue({ success: true, score: 0.9 })
  sendRequest.mockResolvedValue({ key: 'push-key-1' })
  verifyKey.mockResolvedValue({
    ok: true,
    keyId: '0123456789ab',
    ownerHash: '0xowner',
  })
  delete process.env.FAUCET_API_KEY_NETWORKS
})

describe('POST /api/faucet — browser path', () => {
  // The contract the browser depends on: the exact body request-form.tsx sends
  // must keep producing the same status and shape.
  it('accepts the body the browser sends and returns Pending with a key', async () => {
    const { res, run } = call(browserBody)
    await run()

    expect(res._getStatusCode()).toBe(200)
    expect(res._getJSONData()).toEqual({
      status: RequestStatus.Pending,
      key: 'push-key-1',
    })
    expect(captchaVerify).toHaveBeenCalledTimes(1)
    expect(captchaVerify).toHaveBeenCalledWith('token')
    expect(verifyKey).not.toHaveBeenCalled()
  })

  it('passes AuthLevel.none and no userId when there is no session', async () => {
    const { run } = call(browserBody)
    await run()

    expect(sendRequest).toHaveBeenCalledWith({
      address: VALID,
      skipStables: true,
      network: 'celo-sepolia',
      authLevel: AuthLevel.none,
      channel: AdmissionChannel.browser,
      ip: '203.0.113.7',
      userId: undefined,
    })
  })

  it('upgrades to authenticated and hashes the email when signed in', async () => {
    getServerSession.mockResolvedValue({ user: { email: '0xdeadbeef' } })
    const { run } = call(browserBody)
    await run()

    const [params] = sendRequest.mock.calls[0]
    expect(params.authLevel).toBe(AuthLevel.authenticated)
    expect(params.userId).toMatch(/^0x[0-9a-f]{64}$/)
  })

  it('returns 401 and never enqueues when the captcha fails', async () => {
    captchaVerify.mockResolvedValue({
      success: false,
      'error-codes': ['invalid-input-response'],
    })
    const { res, run } = call(browserBody)
    await run()

    expect(res._getStatusCode()).toBe(401)
    expect(res._getJSONData().message).toBe('invalid-input-response')
    expect(sendRequest).not.toHaveBeenCalled()
  })

  it('returns 403 with the documented message when rate limited', async () => {
    sendRequest.mockResolvedValue({
      reason: 'rate_limited',
      bucket: 'beneficiary',
      count: 4,
      limit: 4,
    })
    const { res, run } = call(browserBody)
    await run()

    expect(res._getStatusCode()).toBe(403)
    expect(res._getJSONData()).toEqual({
      status: RequestStatus.Failed,
      message: 'Fauceting denied. Please check the faucet rules below.',
    })
  })

  it('returns 404 when sendRequest throws', async () => {
    sendRequest.mockRejectedValue(new Error('boom'))
    const { res, run } = call(browserBody)
    await run()

    expect(res._getStatusCode()).toBe(404)
    expect(res._getJSONData().message).toBe('Error while fauceting')
  })
})

describe('POST /api/faucet — validation', () => {
  it('rejects an unknown network before verifying anything', async () => {
    const { res, run } = call({ ...browserBody, network: 'celo-mainnet' })
    await run()

    expect(res._getStatusCode()).toBe(400)
    expect(res._getJSONData().message).toBe('Invalid network: celo-mainnet')
    expect(captchaVerify).not.toHaveBeenCalled()
  })

  it.each([['not-an-address'], [''], [undefined], [42]])(
    'rejects beneficiary %s with 400 rather than a generic 404',
    async (beneficiary) => {
      const { res, run } = call({ ...browserBody, beneficiary })
      await run()

      expect(res._getStatusCode()).toBe(400)
      expect(res._getJSONData().message).toBe('Invalid beneficiary address')
      expect(sendRequest).not.toHaveBeenCalled()
    },
  )

  it('rejects non-POST with 405 and an Allow header', async () => {
    const { res, run } = call(undefined, { method: 'GET' })
    await run()

    expect(res._getStatusCode()).toBe(405)
    expect(res._getHeaders().allow).toBe('POST')
    expect(captchaVerify).not.toHaveBeenCalled()
  })
})

describe('POST /api/faucet — API key path', () => {
  it('admits a valid key without any captcha and enqueues as authenticated', async () => {
    const { res, run } = call(keyedBody, { authorization: `Bearer ${KEY}` })
    await run()

    expect(res._getStatusCode()).toBe(200)
    expect(captchaVerify).not.toHaveBeenCalled()
    expect(getServerSession).not.toHaveBeenCalled()
    expect(sendRequest).toHaveBeenCalledWith({
      address: VALID,
      skipStables: true,
      network: 'celo-sepolia',
      authLevel: AuthLevel.authenticated,
      channel: AdmissionChannel.apiKey,
      ip: '203.0.113.7',
      userId: '0xowner',
    })
  })

  // The property that keeps a key from being a quota upgrade: it is limited
  // under the same identity as the browser session.
  it('limits the key under its owner identity, not a fresh bucket', async () => {
    const { run } = call(keyedBody, { authorization: `Bearer ${KEY}` })
    await run()

    expect(sendRequest.mock.calls[0][0].userId).toBe('0xowner')
  })

  it.each([
    ['unknown' as const, 'Invalid or expired API key'],
    ['malformed' as const, 'Invalid or expired API key'],
  ])(
    'returns 401 for a %s key and never falls back to captcha',
    async (reason, message) => {
      verifyKey.mockResolvedValue({ ok: false, reason })
      const { res, run } = call(keyedBody, { authorization: 'Bearer nope' })
      await run()

      expect(res._getStatusCode()).toBe(401)
      expect(res._getJSONData().message).toBe(message)
      expect(captchaVerify).not.toHaveBeenCalled()
      expect(sendRequest).not.toHaveBeenCalled()
    },
  )

  it('returns 401 while the kill switch is set', async () => {
    verifyKey.mockResolvedValue({ ok: false, reason: 'disabled' })
    const { res, run } = call(keyedBody, { authorization: `Bearer ${KEY}` })
    await run()

    expect(res._getStatusCode()).toBe(401)
    expect(res._getJSONData().message).toBe(
      'Programmatic access is temporarily disabled',
    )
    expect(sendRequest).not.toHaveBeenCalled()
  })

  it('ignores a non-bearer Authorization header and uses the browser path', async () => {
    const { res, run } = call(browserBody, { authorization: 'Basic abc123' })
    await run()

    expect(res._getStatusCode()).toBe(200)
    expect(captchaVerify).toHaveBeenCalledTimes(1)
    expect(verifyKey).not.toHaveBeenCalled()
  })

  // CDP returns 429 with a machine-readable code; the browser keeps its 403.
  it('returns 429 with faucet_limit_exceeded when a keyed request is limited', async () => {
    sendRequest.mockResolvedValue({
      reason: 'rate_limited',
      bucket: 'user',
      count: 10,
      limit: 10,
    })
    const { res, run } = call(keyedBody, { authorization: `Bearer ${KEY}` })
    await run()

    expect(res._getStatusCode()).toBe(429)
    expect(res._getJSONData().error).toBe('faucet_limit_exceeded')
    expect(res._getHeaders()['retry-after']).toBe('86400')
  })

  it('keeps the browser 403 unchanged when the browser is limited', async () => {
    sendRequest.mockResolvedValue({
      reason: 'rate_limited',
      bucket: 'beneficiary',
      count: 4,
      limit: 4,
    })
    const { res, run } = call(browserBody)
    await run()

    expect(res._getStatusCode()).toBe(403)
    expect(res._getJSONData()).toEqual({
      status: RequestStatus.Failed,
      message: 'Fauceting denied. Please check the faucet rules below.',
    })
  })

  it('tags an invalid key with invalid_api_key', async () => {
    verifyKey.mockResolvedValue({ ok: false, reason: 'unknown' })
    const { res, run } = call(keyedBody, { authorization: 'Bearer nope' })
    await run()

    expect(res._getJSONData().error).toBe('invalid_api_key')
  })

  it('tags a disabled key with api_key_disabled', async () => {
    verifyKey.mockResolvedValue({ ok: false, reason: 'disabled' })
    const { res, run } = call(keyedBody, { authorization: `Bearer ${KEY}` })
    await run()

    expect(res._getJSONData().error).toBe('api_key_disabled')
  })

  it('refuses the key path on a network that is not allowlisted', async () => {
    process.env.FAUCET_API_KEY_NETWORKS = 'some-other-net'
    const { res, run } = call(keyedBody, { authorization: `Bearer ${KEY}` })
    await run()

    expect(res._getStatusCode()).toBe(400)
    expect(res._getJSONData().message).toContain('not enabled')
    expect(verifyKey).not.toHaveBeenCalled()
    expect(sendRequest).not.toHaveBeenCalled()
  })
})

import { createMocks } from 'node-mocks-http'
import type { NextApiRequest, NextApiResponse } from 'next'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RequestStatus } from 'types'

const getRequestRecord = vi.hoisted(() => vi.fn())

vi.mock('utils/firebase.serverside', () => ({ getRequestRecord }))

import handler from '../pages/api/status'

function call(query: Record<string, string>) {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method: 'GET',
    query: { network: 'celo-sepolia', ...query },
  })
  return { res, run: () => handler(req, res) }
}

beforeEach(() => {
  getRequestRecord.mockReset()
  getRequestRecord.mockResolvedValue(null)
})

describe('GET /api/status — request key', () => {
  // Regression (#309): Firebase drops empty path segments, so `/` read the
  // whole /{net}/requests list and `a/b` reached a request's children.
  it.each([
    ['/', '/'],
    ['a/b', 'a/b'],
    ['a dot', '-abc.def'],
    ['a hash', '-abc#def'],
    ['a dollar', '-abc$def'],
    ['brackets', '-abc[0]'],
    ['a control character', '-abc\u0000'],
    ['an over-long key', 'x'.repeat(65)],
  ])('rejects %s with 400 without touching Firebase', async (_, key) => {
    const { res, run } = call({ key })
    await run()

    expect(res._getStatusCode()).toBe(400)
    expect(res._getJSONData()).toEqual({ message: 'Invalid request key' })
    expect(getRequestRecord).not.toHaveBeenCalled()
  })

  it('rejects an empty key with 400', async () => {
    const { res, run } = call({ key: '' })
    await run()

    expect(res._getStatusCode()).toBe(400)
    expect(getRequestRecord).not.toHaveBeenCalled()
  })

  it('returns the record for a real push ID', async () => {
    getRequestRecord.mockResolvedValue({
      status: RequestStatus.Done,
      beneficiary: '0x0000000000000000000000000000000000000001',
      goldTxHash: '0xabc',
    })
    const { res, run } = call({ key: '-OAbCdEfGhIjKlMnOpQr' })
    await run()

    expect(getRequestRecord).toHaveBeenCalledWith(
      '-OAbCdEfGhIjKlMnOpQr',
      'celo-sepolia',
    )
    expect(res._getStatusCode()).toBe(200)
    expect(res._getJSONData()).toMatchObject({
      status: RequestStatus.Done,
      txHash: '0xabc',
    })
  })

  // The outage probe: it must still reach Firebase so a 404 proves the
  // database read works and a 500 shows it does not.
  it('still reads Firebase for key=probe and answers 404', async () => {
    const { res, run } = call({ key: 'probe' })
    await run()

    expect(getRequestRecord).toHaveBeenCalledWith('probe', 'celo-sepolia')
    expect(res._getStatusCode()).toBe(404)
    expect(res._getJSONData()).toEqual({ message: 'No such request' })
  })
})

import type { NextApiRequest, NextApiResponse } from 'next'
import { networks, RequestStatus } from 'types'
import { getRequestRecord } from 'utils/firebase.serverside'

/**
 * A single Realtime Database key: no path separators or other characters RTDB
 * reserves, and short enough to be a push ID. Without this, `key=/` resolved
 * to `/{net}/requests` (Firebase drops empty segments) and `key=<id>/<field>`
 * reached a request's leaves.
 *
 * Deliberately not the strict push-ID shape: `key=probe` must still reach
 * Firebase and answer 404, because that is the outage probe (404 when the
 * database works, 500 when it does not).
 */
const REQUEST_KEY = /^[^/.#$[\]\u0000-\u001f\u007f]{1,64}$/

export type StatusAPIResponse =
  | {
      status: RequestStatus
      beneficiary?: string
      txHash?: string
    }
  | { message: string }

/**
 * HTTP view of a queued request.
 *
 * The browser subscribes to the Realtime Database over a websocket, which a
 * programmatic caller cannot reasonably do; without this endpoint an agent has
 * no way to tell whether a payout landed.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<StatusAPIResponse>,
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    res.status(405).json({ message: `Method ${req.method} not allowed` })
    return
  }

  const key = String(req.query.key ?? '')
  const network = String(req.query.network ?? '')

  if (!networks.includes(network as (typeof networks)[number])) {
    res.status(400).json({ message: `Invalid network: ${network}` })
    return
  }
  if (!key) {
    res.status(400).json({ message: 'Missing request key' })
    return
  }
  if (!REQUEST_KEY.test(key)) {
    res.status(400).json({ message: 'Invalid request key' })
    return
  }

  try {
    const record = await getRequestRecord(
      key,
      network as (typeof networks)[number],
    )
    if (!record) {
      res.status(404).json({ message: 'No such request' })
      return
    }

    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json({
      status: record.status,
      beneficiary: record.beneficiary,
      // goldTxHash is the current field; celoTxhash is read so requests queued
      // before that fix still resolve.
      txHash: record.goldTxHash ?? record.celoTxhash,
    })
  } catch (error) {
    console.error('Failed to read request status', error)
    res.status(500).json({ message: 'Could not read request status' })
  }
}

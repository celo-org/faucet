import type { NextApiRequest, NextApiResponse } from 'next'
import { ApiKeyRecord, KEY_TTL_DAYS, MAX_KEYS_PER_OWNER } from 'types'
import { listKeysForOwner, mintKey } from 'utils/api-key'
import { getOwnerHash } from 'utils/session-owner'

export type KeysAPIResponse =
  | { keys: ApiKeyRecord[] }
  /** `key` is returned exactly once, at creation, and never stored in full. */
  | { key: string; record: ApiKeyRecord }
  | { message: string }

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<KeysAPIResponse>,
) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    res.status(405).json({ message: `Method ${req.method} not allowed` })
    return
  }

  const ownerHash = await getOwnerHash(req, res)
  if (!ownerHash) {
    res.status(401).json({ message: 'Sign in with GitHub to manage API keys' })
    return
  }

  try {
    if (req.method === 'GET') {
      res.status(200).json({ keys: await listKeysForOwner(ownerHash) })
      return
    }

    const label = String(req.body?.label ?? '').trim()
    if (!label) {
      res.status(400).json({ message: 'A label is required' })
      return
    }

    const { key, record } = await mintKey(ownerHash, label)
    console.info(
      JSON.stringify({
        event: 'celo/faucet/key_minted',
        keyId: record.keyId,
        expiresAt: record.expiresAt,
      }),
    )
    res.status(201).json({ key, record })
  } catch (error) {
    // mintKey throws a user-facing message when the owner is at their cap.
    const message = error instanceof Error ? error.message : 'Unknown error'
    const atCap = message.includes('already have')
    if (!atCap) {
      console.error('Failed to handle API key request', error)
    }
    res.status(atCap ? 409 : 500).json({
      message: atCap
        ? message
        : `Could not create a key. Keys last ${KEY_TTL_DAYS} days and you may hold ${MAX_KEYS_PER_OWNER}.`,
    })
  }
}

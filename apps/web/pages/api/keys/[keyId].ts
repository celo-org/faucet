import type { NextApiRequest, NextApiResponse } from 'next'
import { revokeKey } from 'utils/api-key'
import { getOwnerHash } from 'utils/session-owner'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ message: string }>,
) {
  if (req.method !== 'DELETE') {
    res.setHeader('Allow', 'DELETE')
    res.status(405).json({ message: `Method ${req.method} not allowed` })
    return
  }

  const ownerHash = await getOwnerHash(req, res)
  if (!ownerHash) {
    res.status(401).json({ message: 'Sign in with GitHub to manage API keys' })
    return
  }

  const keyId = String(req.query.keyId ?? '')

  try {
    // Returns false for someone else's key as well as a missing one, so this
    // endpoint cannot be used to probe which key ids exist.
    const revoked = await revokeKey(keyId, ownerHash)
    if (!revoked) {
      res.status(404).json({ message: 'No such key' })
      return
    }
    console.info(JSON.stringify({ event: 'celo/faucet/key_revoked', keyId }))
    res.status(200).json({ message: 'Key revoked' })
  } catch (error) {
    console.error('Failed to revoke API key', error)
    res.status(500).json({ message: 'Could not revoke the key' })
  }
}

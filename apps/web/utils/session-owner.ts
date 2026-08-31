import type { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth/next'
import { Hex, sha256 } from 'viem'
import { authOptions } from '../pages/api/auth/[...nextauth]'

/**
 * Stable identifier for the signed-in GitHub user.
 *
 * This is the same value `/api/faucet` uses for its per-identity rate-limit
 * bucket, which is what makes a minted key share its owner's quota rather than
 * adding a new one.
 */
export async function getOwnerHash(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<string | undefined> {
  try {
    const session = await getServerSession(req, res, authOptions)
    const email = session?.user?.email
    return email ? sha256(email as Hex) : undefined
  } catch (e) {
    console.error('Authentication check failed', e)
    return undefined
  }
}

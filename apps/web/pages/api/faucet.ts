import { ipAddress } from '@vercel/functions'
import type { NextApiRequest, NextApiResponse } from 'next'
import { Session } from 'next-auth'
import { getServerSession } from 'next-auth/next'
import { Hex, sha256 } from 'viem'
import { sendRequest } from '../../utils/firebase.serverside'
import { authOptions } from './auth/[...nextauth]'
import { captchaVerify } from 'utils/captcha-verify'
import { AuthLevel, FaucetAPIResponse, networks, RequestStatus } from 'types'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<FaucetAPIResponse>,
) {
  let authLevel = AuthLevel.none
  let session: Session | null | undefined
  try {
    session = await getServerSession(req, res, authOptions)
    if (session) {
      authLevel = AuthLevel.authenticated
    }
  } catch (e) {
    console.error('Authentication check failed', e)
  }

  const { captchaToken, beneficiary, network } = req.body

  if (!networks.includes(network)) {
    res.status(400).json({
      status: RequestStatus.Failed,
      message: `Invalid network: ${network}`,
    })
    return
  }
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    headers.set(key, value as string)
  }

  const captchaResponse = await captchaVerify(captchaToken)
  if (captchaResponse.success) {
    try {
      const { key, reason } = await sendRequest(
        beneficiary,
        true,
        network,
        authLevel,
        ipAddress(headers) ||
          (req.headers['x-forwarded-for'] as string | undefined),
        session?.user?.email ? sha256(session.user.email as Hex) : undefined,
      )

      if (key) {
        res.status(200).json({ status: RequestStatus.Pending, key })
      } else if (reason === 'rate_limited') {
        res.status(403).json({
          status: RequestStatus.Failed,
          message: 'Fauceting denied. Please check the faucet rules below.',
        })
      } else {
        throw new Error(reason)
      }
    } catch (error) {
      console.error(error)
      res.status(404).json({
        status: RequestStatus.Failed,
        message: 'Error while fauceting',
      })
    }
  } else {
    console.error(
      'Faucet Failed due to Recaptcha',
      captchaResponse['error-codes'],
    )
    res.status(401).json({
      status: RequestStatus.Failed,
      message: captchaResponse['error-codes']?.toString() || 'unknown',
    })
  }
}

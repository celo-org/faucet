import type { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth/next'
import { AuthLevel, FaucetAPIResponse, networks, RequestStatus } from 'types'
import { captchaVerify } from '../../utils/captcha-verify'
import { sendRequest } from '../../utils/firebase.serverside'
import { authOptions } from './auth/[...nextauth]'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<FaucetAPIResponse>,
) {
  let authLevel = AuthLevel.none
  try {
    const session = await getServerSession(req, res, authOptions)
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

  const captchaResponse = await captchaVerify(captchaToken)
  if (captchaResponse.success) {
    try {
      const { result, reason } = await sendRequest(
        beneficiary,
        true,
        network,
        authLevel,
      )

      if (result) {
        res.status(200).json({ status: RequestStatus.Pending, key })
      } else if (reason === 'rate_limited') {
        res.status(403).json({
          status: RequestStatus.Failed,
          message: 'Fauceting denied',
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

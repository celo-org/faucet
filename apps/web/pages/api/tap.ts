import type { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth/next'
import { Address, isAddress } from 'viem'
import { authOptions } from './auth/[...nextauth]'
import { isUsingNewFaucetService } from 'config/chains'
import { prepareTransfer, tranferFunds } from 'services/transfer'
import { AuthLevel, Faucet2APIResponse, RequestStatus } from 'types'
import { captchaVerify } from 'utils/captcha-verify'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Faucet2APIResponse>,
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

  const { captchaToken, to, chainId } = verifyBody(req.body)


  if (!isUsingNewFaucetService(chainId)) {
    res.status(400).json({
      status: RequestStatus.Failed,
      message: `Invalid chain: ${chainId}`,
    })
    return
  }

  const captchaResponse = await captchaVerify(captchaToken)
  if (process.env.VERCEL_ENV === 'preview' || captchaResponse.success) {
    try {

      const { value, chain } = await prepareTransfer(to, chainId, authLevel)
      const hash = await tranferFunds({to, value}, chain)
      console.info("transfer pending", to,  hash)
      res.status(200).json({ txHash: hash, status: RequestStatus.Pending })
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

function verifyBody(body: any): { captchaToken: string; to: Address; chainId: number } {
  const { captchaToken, to, chainId } = body
  if (!captchaToken || !to || !chainId) {
    throw new Error('Missing required fields')
  }
  if (typeof captchaToken !== 'string' || typeof to !== 'string' || typeof chainId !== 'number') {
    throw new Error('Invalid field types')
  }
  if (!isAddress(to)) {
    throw new Error('Invalid address format')
  }
  return { captchaToken, to, chainId }
}
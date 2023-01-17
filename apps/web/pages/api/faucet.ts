import type { NextApiRequest, NextApiResponse } from 'next'
import captchaVerify from '../../src/captchaVerify'
import { FaucetAPIResponse, RequestStatus } from '../../src/faucet-interfaces'
import { sendRequest } from '../../src/firebase-serverside'


export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<FaucetAPIResponse>
) {
  const { captchaToken, beneficiary } = req.body
  const captchaResponse = await captchaVerify(captchaToken)
  if (captchaResponse.success) {
    try {
      const key = await sendRequest(beneficiary)
      res.status(200).json({ status: RequestStatus.Pending, key })
    } catch (error) {
      console.error(error)
      res.status(404).json({ status: RequestStatus.Failed, message: "Error while fauceting" })
    }
  } else {
    console.error("Faucet Failed due to Recaptcha", captchaResponse["error-codes"])
    res.status(401).json({ status: RequestStatus.Failed, message: captchaResponse["error-codes"]?.toString() || 'unknown' })
  }

}

import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from './auth/[...nextauth]';
import captchaVerify from 'src/captcha-verify';
import {
  FaucetAPIResponse,
  RequestStatus,
  AuthLevel,
  Network,
  networks,
} from 'src/faucet-interfaces';
import { sendRequest } from 'src/firebase-serverside';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<FaucetAPIResponse>
) {
  let authLevel = AuthLevel.none;
  try {
    const session = await getServerSession(req, res, authOptions);
    if (session) {
      authLevel = AuthLevel.authenticated;
    }
  } catch (e) {
    console.error('Authentication check failed', e);
  }

  const { captchaToken, beneficiary, skipStables, network } = req.body;

  if (!networks.includes(network)) {
    res.status(400).json({
      status: RequestStatus.Failed,
      message: `Invalid network: ${network}`,
    });
    return;
  }

  const captchaResponse = await captchaVerify(captchaToken);
  if (captchaResponse.success) {
    try {
      const key = await sendRequest(
        beneficiary,
        skipStables,
        network,
        authLevel
      );
      res.status(200).json({ status: RequestStatus.Pending, key });
    } catch (error) {
      console.error(error);
      res.status(404).json({
        status: RequestStatus.Failed,
        message: 'Error while fauceting',
      });
    }
  } else {
    console.error(
      'Faucet Failed due to Recaptcha',
      captchaResponse['error-codes']
    );
    res.status(401).json({
      status: RequestStatus.Failed,
      message: captchaResponse['error-codes']?.toString() || 'unknown',
    });
  }
}

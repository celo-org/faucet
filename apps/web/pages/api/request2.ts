import type { NextApiRequest, NextApiResponse } from 'next'
import { Hex, isHash } from 'viem'
import { FaucetRequest, processFaucet } from 'utils/simple-faucet'

export type FaucetResponce =
  | {
      hash: Hex
      ok: true
    }
  | {
      message: string
      ok: false
    }

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<FaucetResponce>,
) {
  const request = req.body as FaucetRequest

  try {
    const result = await processFaucet(request)
    if (typeof result === 'string' && isHash(result)) {
      res.status(200).json({
        hash: result,
        ok: true,
      })
    } else {
      res.status(400).json({
        message: 'Invalid response from faucet processing',
        ok: false,
      })
    }
  } catch (error) {
    console.error(error)
    res.status(500).json({
      ok: false,
      message: 'Error while fauceting',
    })
  }
}

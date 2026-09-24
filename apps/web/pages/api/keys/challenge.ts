import type { NextApiRequest, NextApiResponse } from 'next'
import {
  createChallenge,
  IDENTITY_REGISTRY_ADDRESS,
  IDENTITY_REGISTRY_CHAIN_ID,
  parseAgentId,
  resolveAgentWallet,
} from 'utils/agent-identity'

export type ChallengeAPIResponse =
  | {
      message: string
      nonce: string
      expiresAt: number
      /** Echoed so a caller knows which key to sign with. */
      agentWallet: string
    }
  | { message: string; error: string }

/**
 * Step one of minting a key without a browser.
 *
 * Open on purpose: it reveals only what the registry already publishes, and
 * the nonce it hands out is worthless without the agent's signing key.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ChallengeAPIResponse>,
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res
      .status(405)
      .json({
        message: `Method ${req.method} not allowed`,
        error: 'bad_method',
      })
    return
  }

  const agentId = parseAgentId(req.body?.agentId)
  if (agentId === undefined) {
    res.status(400).json({
      message: 'agentId must be a decimal ERC-8004 agent id',
      error: 'invalid_agent_id',
    })
    return
  }

  try {
    const wallet = await resolveAgentWallet(agentId)
    if (!wallet) {
      // Distinguished from "not registered" only in the message: the registry
      // reverts for an unknown id and returns the zero address for a
      // registered one with no wallet set, and both are fixed the same way.
      res.status(404).json({
        message: `Agent ${agentId} has no wallet set in the registry at ${IDENTITY_REGISTRY_ADDRESS} on chain ${IDENTITY_REGISTRY_CHAIN_ID}. Register the agent and call setAgentWallet, then retry.`,
        error: 'agent_wallet_unset',
      })
      return
    }

    const challenge = await createChallenge(agentId)
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json({ ...challenge, agentWallet: wallet })
  } catch (error) {
    console.error('Failed to create an agent challenge', error)
    res.setHeader('Retry-After', '30')
    res.status(503).json({
      message: 'Could not reach the identity registry, retry shortly',
      error: 'faucet_unavailable',
    })
  }
}

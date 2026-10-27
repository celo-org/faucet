import type { NextApiRequest, NextApiResponse } from 'next'
import {
  ChallengeAction,
  createChallenge,
  IDENTITY_REGISTRY_ADDRESS,
  IDENTITY_REGISTRY_CHAIN_ID,
  parseAgentId,
  parseChallengeAction,
  resolveAgentWallet,
} from 'utils/agent-identity'

export type ChallengeAPIResponse =
  | {
      message: string
      nonce: string
      expiresAt: number
      /** What the signed message authorises: `mint` (default) or `revoke`. */
      action: ChallengeAction
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
    res.status(405).json({
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

  const action = parseChallengeAction(req.body?.action)
  if (!action) {
    res.status(400).json({
      message: 'action must be "mint" or "revoke"',
      error: 'invalid_action',
    })
    return
  }

  try {
    const wallet = await resolveAgentWallet(agentId)
    if (!wallet) {
      // The registry returns the zero address both for an id that was never
      // registered and for a registered agent whose wallet is unset or was
      // cleared on transfer. Both are fixed the same way.
      res.status(404).json({
        message: `Agent ${agentId} has no wallet set in the registry at ${IDENTITY_REGISTRY_ADDRESS} on chain ${IDENTITY_REGISTRY_CHAIN_ID}. Register the agent and call setAgentWallet, then retry.`,
        error: 'agent_wallet_unset',
      })
      return
    }

    const challenge = await createChallenge(agentId, action)
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json({ ...challenge, agentWallet: wallet })
  } catch (error) {
    // Reached when the registry RPC or Redis fails. resolveAgentWallet lets
    // RPC errors through on purpose, so an outage reads as retryable here
    // rather than as an agent with no wallet.
    console.error('Failed to create an agent challenge', error)
    res.setHeader('Retry-After', '30')
    res.status(503).json({
      message: 'Could not reach the identity registry, retry shortly',
      error: 'faucet_unavailable',
    })
  }
}

import type { Hex } from 'viem'
import type { NextApiRequest, NextApiResponse } from 'next'
import { ApiKeyRecord, MAX_KEYS_PER_OWNER } from 'types'
import {
  agentOwnerHash,
  challengeMessage,
  consumeChallenge,
  parseAgentId,
  resolveAgentWallet,
  verifyAgentSignature,
} from 'utils/agent-identity'
import { mintKey, revokeKey } from 'utils/api-key'

export type AgentKeyAPIResponse =
  /** `key` is returned exactly once, at creation, and never stored in full. */
  { key: string; record: ApiKeyRecord } | { message: string; error?: string }

const SIGNATURE_PATTERN = /^0x[0-9a-fA-F]+$/

/**
 * Step two: mint a key for an agent that has signed the challenge.
 *
 * No session is consulted and no captcha is solved, which is the entire point
 * — an agent can complete this with a signing key and nothing else. The key it
 * receives is bound to the agent id rather than to a person, so it draws on
 * its own allowance instead of borrowing its operator's.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AgentKeyAPIResponse>,
) {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    res.setHeader('Allow', 'POST, DELETE')
    res
      .status(405)
      .json({
        message: `Method ${req.method} not allowed`,
        error: 'bad_method',
      })
    return
  }

  const agentId = parseAgentId(req.body?.agentId)
  const nonce = String(req.body?.nonce ?? '')
  const signature = String(req.body?.signature ?? '')

  if (agentId === undefined) {
    res.status(400).json({
      message: 'agentId must be a decimal ERC-8004 agent id',
      error: 'invalid_agent_id',
    })
    return
  }
  if (!SIGNATURE_PATTERN.test(signature)) {
    res
      .status(400)
      .json({
        message: 'signature must be 0x-prefixed hex',
        error: 'invalid_signature',
      })
    return
  }

  try {
    // Consumed before anything else can fail, and before the key is minted.
    // Verifying first and deleting afterwards would leave a window in which
    // two concurrent requests both verify the same signature and both mint.
    const expiresAt = await consumeChallenge(agentId, nonce)
    if (!expiresAt) {
      res.status(401).json({
        message:
          'Unknown, expired or already-used challenge. Request a new one.',
        error: 'invalid_challenge',
      })
      return
    }

    const wallet = await resolveAgentWallet(agentId)
    if (!wallet) {
      res.status(404).json({
        message: `Agent ${agentId} has no wallet set in the registry`,
        error: 'agent_wallet_unset',
      })
      return
    }

    // Rebuilt from the stored expiry rather than taken from the request, so a
    // caller cannot present a signature over a message of its own choosing.
    const expected = challengeMessage(agentId, nonce, expiresAt)
    const valid = await verifyAgentSignature(wallet, expected, signature as Hex)
    if (!valid) {
      res.status(401).json({
        message: `Signature does not verify against the agent wallet ${wallet}`,
        error: 'invalid_signature',
      })
      return
    }

    const ownerHash = agentOwnerHash(agentId)

    /**
     * Revocation has to go through the same proof, because an agent key is
     * bound to an agent rather than to a person: nobody can reach it through
     * the signed-in path at /keys. Without this an agent that leaked a key
     * could not withdraw it, and would have to wait out the 90-day expiry.
     */
    if (req.method === 'DELETE') {
      const keyId = String(req.body?.keyId ?? '')
      const revoked = await revokeKey(keyId, ownerHash)
      if (!revoked) {
        // Returns the same 404 for another agent's key as for a missing one,
        // so this cannot be used to probe which key ids exist.
        res.status(404).json({ message: 'No such key', error: 'unknown_key' })
        return
      }
      console.info(
        JSON.stringify({
          event: 'celo/faucet/key_revoked',
          channel: 'agent',
          keyId,
          agentId: agentId.toString(),
        }),
      )
      res.status(200).json({ message: 'Key revoked' })
      return
    }

    const { key, record } = await mintKey(ownerHash, `agent-${agentId}`)

    console.info(
      JSON.stringify({
        event: 'celo/faucet/key_minted',
        channel: 'agent',
        keyId: record.keyId,
        agentId: agentId.toString(),
        expiresAt: record.expiresAt,
      }),
    )
    res.status(201).json({ key, record })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    // mintKey throws a user-facing message when the owner is at their cap.
    const atCap = message.includes('already have')
    if (!atCap) {
      console.error('Failed to mint an agent key', error)
    }
    res.status(atCap ? 409 : 500).json({
      message: atCap
        ? message
        : `Could not create a key. An agent may hold ${MAX_KEYS_PER_OWNER}.`,
      error: atCap ? 'key_limit_reached' : 'faucet_unavailable',
    })
  }
}

import type { Hex } from 'viem'
import type { NextApiRequest, NextApiResponse } from 'next'
import { ApiKeyRecord, MAX_KEYS_PER_OWNER } from 'types'
import {
  agentOwnerHash,
  challengeMessage,
  consumeChallenge,
  parseAgentId,
  resolveAgentRegisteredAt,
  resolveAgentWallet,
  verifyAgentSignature,
} from 'utils/agent-identity'
import { agentTier } from 'utils/agent-allowance'
import { mintKey, revokeAllKeysForOwner, revokeKey } from 'utils/api-key'

export type AgentKeyAPIResponse =
  /** `key` is returned exactly once, at creation, and never stored in full. */
  | { key: string; record: ApiKeyRecord }
  | { message: string; revoked?: number; error?: string }

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
    res.status(405).json({
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
    res.status(400).json({
      message: 'signature must be 0x-prefixed hex',
      error: 'invalid_signature',
    })
    return
  }

  try {
    // Consumed before anything else can fail, and before the key is minted.
    // Verifying first and deleting afterwards would leave a window in which
    // two concurrent requests both verify the same signature and both mint.
    const challenge = await consumeChallenge(agentId, nonce)
    if (!challenge) {
      res.status(401).json({
        message:
          'Unknown, expired or already-used challenge. Request a new one.',
        error: 'invalid_challenge',
      })
      return
    }

    // A challenge says what it is for, so a signature gathered for a mint
    // cannot be turned into a revoke, or the other way round.
    const wanted = req.method === 'DELETE' ? 'revoke' : 'mint'
    if (challenge.action !== wanted) {
      res.status(401).json({
        message: `This challenge authorises "${challenge.action}", not "${wanted}". Request one with action "${wanted}".`,
        error: 'wrong_action',
      })
      return
    }

    // Read fresh rather than from the cache: a wallet rotated or cleared in
    // the registry must stop authorising immediately, not after the cache
    // window. The open challenge route is the one that gets the cache.
    const wallet = await resolveAgentWallet(agentId, { fresh: true })
    if (!wallet) {
      res.status(404).json({
        message: `Agent ${agentId} has no wallet set in the registry`,
        error: 'agent_wallet_unset',
      })
      return
    }

    // Rebuilt from the stored expiry rather than taken from the request, so a
    // caller cannot present a signature over a message of its own choosing.
    const expected = challengeMessage(
      agentId,
      nonce,
      challenge.expiresAt,
      challenge.action,
    )
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
     *
     * With no keyId, every key the agent holds is revoked. That is the
     * recovery path after a signing-key compromise: the attacker's keys were
     * never shown to the rightful agent, so it cannot name them, and listing
     * them would hand the attacker the same view.
     */
    if (req.method === 'DELETE') {
      const keyId =
        req.body?.keyId === undefined || req.body?.keyId === null
          ? ''
          : String(req.body.keyId)

      if (!keyId) {
        const count = await revokeAllKeysForOwner(ownerHash)
        console.info(
          JSON.stringify({
            event: 'celo/faucet/keys_revoked_all',
            channel: 'agent',
            agentId: agentId.toString(),
            revoked: count,
          }),
        )
        res.status(200).json({
          message: count === 1 ? '1 key revoked' : `${count} keys revoked`,
          revoked: count,
        })
        return
      }

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
      res.status(200).json({ message: 'Key revoked', revoked: 1 })
      return
    }

    // Recorded on the key so the allowance can be decided at request time
    // without touching the chain again. Unknown reads as new.
    const agentRegisteredAt = await resolveAgentRegisteredAt(agentId)

    const { key, record } = await mintKey(ownerHash, `agent-${agentId}`, {
      agentId: agentId.toString(),
      agentRegisteredAt,
    })

    console.info(
      JSON.stringify({
        event: 'celo/faucet/key_minted',
        channel: 'agent',
        keyId: record.keyId,
        agentId: agentId.toString(),
        agentTier: agentTier(agentRegisteredAt),
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

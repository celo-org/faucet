import { ipAddress } from '@vercel/functions'
import type { NextApiRequest, NextApiResponse } from 'next'
import { Session } from 'next-auth'
import { getServerSession } from 'next-auth/next'
import { Hex, isAddress, sha256 } from 'viem'
import { authOptions } from './auth/[...nextauth]'
import { sendRequest } from 'utils/firebase.serverside'
import { captchaVerify } from 'utils/captcha-verify'
import { verifyKey } from 'utils/api-key'
import {
  AdmissionChannel,
  AdmissionOutcome,
  hashIp,
  logAdmission,
  logEnqueued,
  logRateLimited,
} from 'utils/metrics'
import { AuthLevel, FaucetAPIResponse, networks, RequestStatus } from 'types'

function bearerToken(req: NextApiRequest): string | undefined {
  const header = req.headers.authorization
  if (!header) {
    return undefined
  }
  const [scheme, ...rest] = header.split(' ')
  if (scheme?.toLowerCase() !== 'bearer') {
    return undefined
  }
  const token = rest.join(' ').trim()
  return token || undefined
}

/** Networks that accept API-key auth. There must be no mainnet exposure. */
function keyPathAllows(network: string): boolean {
  const allowed = process.env.FAUCET_API_KEY_NETWORKS?.split(',')
    .map((n) => n.trim())
    .filter(Boolean)
  return allowed?.length
    ? allowed.includes(network)
    : network === 'celo-sepolia'
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<FaucetAPIResponse>,
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({
      status: RequestStatus.Failed,
      message: `Method ${req.method} not allowed`,
    })
    return
  }

  const { captchaToken, beneficiary, network } = req.body ?? {}
  const token = bearerToken(req)
  const channel = token ? AdmissionChannel.apiKey : AdmissionChannel.browser

  if (!networks.includes(network)) {
    logAdmission({
      channel,
      outcome: AdmissionOutcome.badRequest,
      network,
    })
    res.status(400).json({
      status: RequestStatus.Failed,
      message: `Invalid network: ${network}`,
    })
    return
  }

  // Without this, an invalid address throws inside sendRequest and surfaces as
  // a generic 404, which a programmatic caller cannot act on.
  if (typeof beneficiary !== 'string' || !isAddress(beneficiary)) {
    logAdmission({
      channel,
      outcome: AdmissionOutcome.badRequest,
      network,
    })
    res.status(400).json({
      status: RequestStatus.Failed,
      message: 'Invalid beneficiary address',
    })
    return
  }

  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    headers.set(key, value as string)
  }
  const ip =
    ipAddress(headers) || (req.headers['x-forwarded-for'] as string | undefined)
  const ipHash = hashIp(ip)

  let authLevel = AuthLevel.none
  let userId: string | undefined
  let keyId: string | undefined

  if (token) {
    // A key stands in for the GitHub identity, so the session is not consulted:
    // it would be a wasted JWT verify and an identity with no defined bucket.
    if (!keyPathAllows(network)) {
      logAdmission({
        channel,
        outcome: AdmissionOutcome.badRequest,
        network,
      })
      res.status(400).json({
        status: RequestStatus.Failed,
        message: `API key access is not enabled for ${network}`,
      })
      return
    }

    // verifyKey reaches Redis and throws when FAUCET_API_KEY_PEPPER is absent.
    // Without this guard the rejection escapes the handler as an opaque 500.
    let verified
    try {
      verified = await verifyKey(token)
    } catch (e) {
      console.error('API key verification failed', e)
      logAdmission({
        channel,
        outcome: AdmissionOutcome.invalidKey,
        network,
        ipHash,
      })
      res.setHeader('Retry-After', '30')
      res.status(503).json({
        status: RequestStatus.Failed,
        message: 'Key verification is unavailable, retry shortly',
      })
      return
    }

    if (!verified.ok) {
      // Deliberately no fall-through to the captcha: that would let an attacker
      // probe key space while still being served.
      logAdmission({
        channel,
        outcome:
          verified.reason === 'disabled'
            ? AdmissionOutcome.keyDisabled
            : AdmissionOutcome.invalidKey,
        network,
        ipHash,
      })
      res.status(401).json({
        status: RequestStatus.Failed,
        message:
          verified.reason === 'disabled'
            ? 'Programmatic access is temporarily disabled'
            : 'Invalid or expired API key',
        error:
          verified.reason === 'disabled'
            ? 'api_key_disabled'
            : 'invalid_api_key',
      })
      return
    }

    // Same identity and tier as signing in with GitHub, proven differently.
    authLevel = AuthLevel.authenticated
    userId = verified.ownerHash
    keyId = verified.keyId

    logAdmission({
      channel,
      outcome: AdmissionOutcome.admitted,
      network,
      authLevel,
      keyId,
      ipHash,
    })
  } else {
    let session: Session | null | undefined
    try {
      session = await getServerSession(req, res, authOptions)
      if (session) {
        authLevel = AuthLevel.authenticated
      }
    } catch (e) {
      console.error('Authentication check failed', e)
    }
    userId = session?.user?.email
      ? sha256(session.user.email as Hex)
      : undefined

    const captchaResponse = await captchaVerify(captchaToken)
    if (!captchaResponse.success) {
      logAdmission({
        channel,
        outcome: AdmissionOutcome.captchaFailed,
        network,
        ipHash,
        captchaScore: captchaResponse.score,
        errorCodes: captchaResponse['error-codes'],
      })
      console.error(
        'Faucet Failed due to Recaptcha',
        captchaResponse['error-codes'],
      )
      res.status(401).json({
        status: RequestStatus.Failed,
        message: captchaResponse['error-codes']?.toString() || 'unknown',
      })
      return
    }

    logAdmission({
      channel,
      outcome: AdmissionOutcome.admitted,
      network,
      authLevel,
      ipHash,
      captchaScore: captchaResponse.score,
    })
  }

  try {
    const { key, reason, bucket, count, limit } = await sendRequest({
      address: beneficiary,
      skipStables: true,
      network,
      authLevel,
      channel,
      ip,
      userId,
    })

    if (key) {
      logEnqueued({ channel, key, authLevel, network, keyId })
      res.status(200).json({ status: RequestStatus.Pending, key })
    } else if (reason === 'rate_limited') {
      logRateLimited({
        channel,
        bucket: bucket ?? 'unknown',
        count: count ?? 0,
        limit: limit ?? 0,
        network,
        keyId,
      })
      // 429 on the key path matches the CDP faucet and is the correct
      // semantic for a programmatic caller; the browser keeps its existing
      // 403 so the on-page copy and any existing consumer are untouched.
      if (channel === AdmissionChannel.apiKey) {
        res.setHeader('Retry-After', '86400')
        res.status(429).json({
          status: RequestStatus.Failed,
          message: `Rate limit exceeded (${bucket ?? 'unknown'}). See the faucet rules.`,
          error: 'faucet_limit_exceeded',
        })
      } else {
        res.status(403).json({
          status: RequestStatus.Failed,
          message: 'Fauceting denied. Please check the faucet rules below.',
        })
      }
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
}

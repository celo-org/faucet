import { sha256, toHex } from 'viem'

/**
 * Structured logging for the web side of the faucet.
 *
 * Vercel Runtime Logs capture stdout/stderr, so a log drain can aggregate on
 * the stable `event` key. The shape mirrors `apps/firebase/src/metrics.ts` so
 * both halves of the faucet emit the same `celo/faucet/*` namespace.
 *
 * `@google-cloud/logging` is deliberately not used here: it is a heavy
 * dependency with its own credentials and would add cold-start cost to every
 * serverless invocation.
 */

export enum AdmissionChannel {
  browser = 'browser',
  apiKey = 'api-key',
}

export enum AdmissionOutcome {
  admitted = 'admitted',
  captchaFailed = 'captcha_failed',
  invalidKey = 'invalid_key',
  keyDisabled = 'key_disabled',
  badRequest = 'bad_request',
}

/** Never log a raw IP; hash it so counts stay comparable without the address. */
export function hashIp(ip: string | undefined): string | undefined {
  return ip ? sha256(toHex(ip)).slice(0, 18) : undefined
}

function emit(level: 'info' | 'warn', entry: Record<string, unknown>) {
  const line = JSON.stringify(entry)
  if (level === 'warn') {
    console.warn(line)
  } else {
    console.info(line)
  }
}

export function logAdmission(data: {
  channel: AdmissionChannel
  outcome: AdmissionOutcome
  network?: string
  authLevel?: string
  /** Public key identifier. Never the raw key or its hash. */
  keyId?: string
  ipHash?: string
  /** reCAPTCHA v3 score, otherwise discarded by `captchaVerify`. */
  captchaScore?: number
  errorCodes?: string[]
}) {
  emit(data.outcome === AdmissionOutcome.admitted ? 'info' : 'warn', {
    event: 'celo/faucet/admission',
    ...data,
  })
}

/**
 * A 403 currently logs nothing at all, which makes a drain indistinguishable
 * from a misconfigured cap.
 */
export function logRateLimited(data: {
  channel: AdmissionChannel
  bucket: string
  count: number
  limit: number
  network: string
  keyId?: string
}) {
  emit('warn', { event: 'celo/faucet/rate_limited', ...data })
}

export function logEnqueued(data: {
  channel: AdmissionChannel
  key: string
  authLevel: string
  network: string
  keyId?: string
}) {
  emit('info', { event: 'celo/faucet/enqueued', ...data })
}

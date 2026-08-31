const CAPTCHA_URL = 'https://www.google.com/recaptcha/api/siteverify'

enum Errors {
  MissingSecret = 'missing-input-secret',
  InvalidSecret = 'invalid-input-secret',
  MissingResponse = 'missing-input-response',
  InvalidResponse = 'invalid-input-response',
  BadRequest = 'bad-request',
  Timeout = 'timeout-or-duplicate',
}

export interface RecaptchaResponse {
  success: boolean
  challenge_ts: string // timestamp of the challenge load (ISO format yyyy-MM-dd'T'HH:mm:ssZZ)
  apk_package_name: string // the package name of the app where the reCAPTCHA was solved
  score?: number // v3 only: 0.0 (likely a bot) to 1.0 (likely a human)
  action?: string // v3 only: the action name passed to executeRecaptcha
  hostname?: string
  'error-codes'?: Errors[] // optional
}

export async function captchaVerify(
  captchaToken: string,
): Promise<RecaptchaResponse> {
  const result = await fetch(CAPTCHA_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `secret=${encodeURIComponent(
      process.env.RECAPTCHA_SECRET as string,
    )}&response=${encodeURIComponent(captchaToken)}`,
  })

  return result.json()
}

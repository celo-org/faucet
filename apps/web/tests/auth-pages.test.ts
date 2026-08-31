import { describe, expect, it } from 'vitest'
import { authOptions } from '../pages/api/auth/[...nextauth]'
import { AUTH_ERRORS, authErrorCopy } from '../utils/auth-errors'

/**
 * next-auth splits error routing in two (`core/index.js`, `case "error"`):
 * the codes below go back to the SIGN-IN page with `?error=`, and everything
 * else goes to `pages.error`. Setting only `pages.error` therefore misses the
 * common OAuth failures entirely.
 */
const ROUTED_TO_SIGNIN = [
  'Signin',
  'OAuthSignin',
  'OAuthCallback',
  'OAuthCreateAccount',
  'EmailCreateAccount',
  'Callback',
  'OAuthAccountNotLinked',
  'EmailSignin',
  'CredentialsSignin',
  'SessionRequired',
]

describe('auth page routing', () => {
  // Regression: with only pages.error set, OAuthCallback never reached our
  // page — it went to next-auth's built-in sign-in page instead.
  it('overrides the sign-in page, which is where common errors land', () => {
    expect(authOptions.pages?.signIn).toBe('/signin')
  })

  it('overrides the error page for the codes that do reach it', () => {
    expect(authOptions.pages?.error).toBe('/auth-error')
  })

  it('keeps the two pages distinct so neither can loop', () => {
    expect(authOptions.pages?.signIn).not.toBe(authOptions.pages?.error)
  })

  it.each([['signIn'], ['error']] as const)(
    'routes %s to an app page, not back into /api/auth',
    (key) => {
      expect(authOptions.pages?.[key]).not.toMatch(/^\/api\/auth/)
    },
  )
})

describe('auth error copy', () => {
  it.each(ROUTED_TO_SIGNIN)('explains %s', (code) => {
    const copy = authErrorCopy(code)
    expect(copy?.title).toBeTruthy()
    expect(copy?.detail).toBeTruthy()
  })

  it('falls back rather than showing a bare code', () => {
    expect(authErrorCopy('SomethingNew')?.title).toBeTruthy()
  })

  it('returns nothing when there is no error', () => {
    expect(authErrorCopy(undefined)).toBeUndefined()
    expect(authErrorCopy('')).toBeUndefined()
  })

  // The whole point: say when changing account cannot help.
  it('marks server-side failures as not actionable', () => {
    expect(AUTH_ERRORS.OAuthCallback.actionable).toBe(false)
    expect(AUTH_ERRORS.Callback.actionable).toBe(false)
    expect(AUTH_ERRORS.Configuration.actionable).toBe(false)
  })

  it('marks genuinely user-fixable failures as actionable', () => {
    expect(AUTH_ERRORS.AccessDenied.actionable).toBe(true)
    expect(AUTH_ERRORS.OAuthAccountNotLinked.actionable).toBe(true)
  })
})

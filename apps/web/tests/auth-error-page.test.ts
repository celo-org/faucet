import { describe, expect, it } from 'vitest'
import { authOptions } from '../pages/api/auth/[...nextauth]'

/**
 * next-auth only shows "Try signing in with a different account" for most
 * failures, including server-side ones, which sends people round a loop
 * changing accounts that were never the problem.
 */
describe('auth error routing', () => {
  it('routes failures to a page we control', () => {
    expect(authOptions.pages?.error).toBe('/auth-error')
  })

  // Regression: an error page that is itself the sign-in page loops.
  it('does not point errors at the sign-in route', () => {
    expect(authOptions.pages?.error).not.toMatch(/signin/i)
  })

  it('leaves the sign-in page as the next-auth default', () => {
    // Overriding signIn would hijack the faucet page's own auth link.
    expect(authOptions.pages?.signIn).toBeUndefined()
  })
})

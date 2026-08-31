import { describe, expect, it } from 'vitest'
import { authOptions } from '../pages/api/auth/[...nextauth]'

/**
 * GitHub sends the RFC 9207 `iss` parameter on the OAuth callback.
 * openid-client asserts an issuer is configured before comparing it, so a
 * provider without one fails every sign-in with
 * "issuer must be configured on the issuer".
 *
 * The provider factory nests user-supplied options under `.options`, and
 * next-auth merges them onto the provider in `core/lib/providers.js` before
 * `core/lib/oauth/client.js` reads `provider.issuer`. That merge is verified
 * separately; these assertions cover the half this repo owns — that an issuer
 * is supplied at all, and that it matches the endpoints it will be compared
 * against.
 */
type OAuthish = {
  id: string
  authorization?: { url?: string } | string
  token?: { url?: string } | string
  options?: { issuer?: string }
}

const urlOf = (v: { url?: string } | string | undefined) =>
  typeof v === 'string' ? v : v?.url

function github(): OAuthish {
  const provider = (authOptions.providers as unknown as OAuthish[]).find(
    (p) => p.id === 'github',
  )
  if (!provider) {
    throw new Error('GitHub provider is not configured')
  }
  return provider
}

describe('GitHub auth provider', () => {
  // Regression: without an issuer, every sign-in dies at the callback.
  it('supplies an issuer', () => {
    expect(github().options?.issuer).toBeTruthy()
  })

  it('uses an issuer that both OAuth endpoints sit under', () => {
    const provider = github()
    const issuer = provider.options?.issuer as string

    // A wrong-but-present issuer swaps the crash for an "iss mismatch", so the
    // value matters as much as its presence.
    expect(urlOf(provider.authorization)?.startsWith(issuer)).toBe(true)
    expect(urlOf(provider.token)?.startsWith(issuer)).toBe(true)
  })

  it('uses an https issuer with no trailing slash', () => {
    expect(github().options?.issuer).toMatch(/^https:\/\/\S+[^/]$/)
  })
})

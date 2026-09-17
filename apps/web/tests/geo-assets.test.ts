import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DRIP_AMOUNTS } from 'config/chains'
import { DAILY_REQUESTS, SITE_URL } from 'config/site'

const publicFile = (name: string) =>
  readFileSync(join(__dirname, '..', 'public', name), 'utf8')

const robots = publicFile('robots.txt')
const sitemap = publicFile('sitemap.xml')
/**
 * Both llms files are hard-wrapped prose, so a phrase under assertion may be
 * split across a line break. Collapse whitespace (and the blockquote markers)
 * before matching, so rewrapping a paragraph does not fail the build.
 */
const flatten = (text: string) =>
  text.replace(/^>\s?/gm, '').replace(/\s+/g, ' ').trim()

const llms = flatten(publicFile('llms.txt'))
const llmsFull = flatten(publicFile('llms-full.txt'))
const openapi = JSON.parse(publicFile('openapi.json'))

const drip = DRIP_AMOUNTS['celo-sepolia']

describe('robots.txt', () => {
  // Regression: this 404'd, so no crawler had an affirmative grant and the
  // sitemap was unannounced.
  it('grants the AI crawlers explicitly rather than relying on the wildcard', () => {
    for (const agent of [
      'GPTBot',
      'OAI-SearchBot',
      'ChatGPT-User',
      'ClaudeBot',
      'Claude-User',
      'anthropic-ai',
      'PerplexityBot',
      'Google-Extended',
      'CCBot',
    ]) {
      expect(robots).toContain(`User-agent: ${agent}`)
    }
  })

  it('advertises the sitemap at the canonical origin', () => {
    expect(robots).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`)
  })

  it('keeps the generated social card fetchable by link unfurlers', () => {
    // /api/ is disallowed wholesale, so og:image would otherwise be unreachable
    // for the crawlers that honour robots.txt.
    expect(robots).toContain('Disallow: /api/')
    expect(robots).toContain('Allow: /api/og')
  })

  it('keeps the auth pages out of the index', () => {
    expect(robots).toContain('Disallow: /signin')
    expect(robots).toContain('Disallow: /auth-error')
  })
})

describe('sitemap.xml', () => {
  it('lists exactly the two indexable pages', () => {
    expect(sitemap).toContain(`<loc>${SITE_URL}/celo-sepolia</loc>`)
    expect(sitemap).toContain(`<loc>${SITE_URL}/keys</loc>`)
    expect(sitemap.match(/<loc>/g)).toHaveLength(2)
  })

  it('does not advertise the noindex pages', () => {
    expect(sitemap).not.toContain('/signin')
    expect(sitemap).not.toContain('/auth-error')
  })
})

describe('published numbers match the enforced ones', () => {
  /**
   * The point of these four. The site previously published "3x the tokens" and
   * no absolute figure at all, so the most common question about the faucet had
   * no answer on this domain. Now that the numbers are published in three
   * static files that cannot import anything, they can silently drift from the
   * code instead — these assertions are what stops that.
   */
  it('states the drip amounts in llms.txt', () => {
    expect(llms).toContain(`${drip.unauthenticated} CELO per request`)
    expect(llms).toContain(`${drip.authenticated} CELO signed in with GitHub`)
  })

  it('states the drip amounts in llms-full.txt', () => {
    expect(llmsFull).toContain(
      `${drip.unauthenticated} CELO per unauthenticated request`,
    )
    expect(llmsFull).toContain(
      `${drip.authenticated} CELO per authenticated request`,
    )
  })

  it('states the daily allowances in llms-full.txt', () => {
    expect(llmsFull).toContain(
      `${DAILY_REQUESTS.unauthenticated} per day unauthenticated`,
    )
    expect(llmsFull).toContain(
      `${DAILY_REQUESTS.authenticated} per day authenticated`,
    )
  })

  /**
   * DRIP_AMOUNTS restates values that live in a different yarn workspace and so
   * cannot be imported. This reads that workspace's source directly, because a
   * comment asking the next person to change both is not a guarantee.
   */
  it('agrees with the payout amounts the Firebase functions actually send', () => {
    const firebaseConfig = readFileSync(
      join(__dirname, '..', '..', 'firebase', 'src', 'config.ts'),
      'utf8',
    )

    const wei = (field: string) => {
      const match = firebaseConfig.match(new RegExp(`${field}:\\s*([0-9_]+)n`))
      if (!match) {
        throw new Error(`Could not find ${field} in the Firebase config`)
      }
      return BigInt(match[1].replace(/_/g, ''))
    }

    const ONE_CELO = 10n ** 18n
    expect(wei('faucetGoldAmount')).toBe(
      BigInt(drip.unauthenticated) * ONE_CELO,
    )
    expect(wei('authenticatedGoldAmount')).toBe(
      BigInt(drip.authenticated) * ONE_CELO,
    )
  })
})

describe('openapi.json', () => {
  it('documents both endpoints an agent needs', () => {
    expect(Object.keys(openapi.paths)).toEqual(['/api/faucet', '/api/status'])
    expect(openapi.paths['/api/faucet'].post.operationId).toBe('requestFunds')
    expect(openapi.paths['/api/status'].get.operationId).toBe(
      'getRequestStatus',
    )
  })

  it('points at the canonical origin', () => {
    expect(openapi.servers).toEqual([{ url: SITE_URL }])
  })

  /**
   * The machine-readable codes are the reason a programmatic caller can branch
   * without parsing prose. If the union in types/index.ts grows, the published
   * schema has to grow with it.
   */
  it('lists every error code the API can return', () => {
    const types = readFileSync(
      join(__dirname, '..', 'types', 'index.ts'),
      'utf8',
    )
    const union = types.slice(types.indexOf('error?:'))
    const declared = [
      ...union.slice(0, union.indexOf('}')).matchAll(/'([a-z_]+)'/g),
    ].map((m) => m[1])

    expect(declared.length).toBeGreaterThan(0)
    expect(
      openapi.components.schemas.Failure.properties.error.enum.sort(),
    ).toEqual(declared.sort())
  })

  it('describes bearer auth, since that is the whole point of a key', () => {
    expect(openapi.components.securitySchemes.apiKey).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    })
  })
})

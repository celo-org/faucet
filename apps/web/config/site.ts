/**
 * Site-level facts that have to agree across the rendered pages, the canonical
 * URLs, and the machine-readable files in public/ (robots.txt, sitemap.xml,
 * llms.txt, openapi.json).
 *
 * Kept here because those public/ files are static and cannot import anything —
 * the tests in tests/geo-assets.test.ts assert the two stay in sync rather than
 * letting them drift silently.
 */
export const SITE_URL = 'https://faucet.celo.org'
export const SITE_NAME = 'Celo Faucet'

/** The network a visitor lands on. `/` redirects here (see next.config.js). */
export const DEFAULT_NETWORK = 'celo-sepolia'

/**
 * Daily request allowances, mirrored from utils/firebase.serverside.ts.
 * Stated on the page because an LLM asked "how many times can I use the Celo
 * faucet" had no on-domain source for these numbers.
 */
export const DAILY_REQUESTS = {
  unauthenticated: 4,
  authenticated: 10,
} as const

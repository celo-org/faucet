import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * No jsdom/RTL in this repo, so this asserts the source rather than a render.
 * Thin, but it pins the two things that were missing: the logo was inert on
 * every page, and there was no route between the faucet and /keys.
 */
const source = readFileSync(
  join(__dirname, '..', 'components', 'faucet-header.tsx'),
  'utf8',
)

describe('FaucetHeader navigation', () => {
  // Regression: /keys, /signin and /auth-error had no way back to the faucet.
  it('wraps the logo in a link home', () => {
    expect(source).toMatch(/<Link[\s\S]*?href=\{HOME_HREF\}[\s\S]*?<Logo \/>/)
  })

  it('gives the logo link an accessible name', () => {
    expect(source).toMatch(/aria-label="Celo faucet home"/)
  })

  it('points home at the faucet itself', () => {
    expect(source).toMatch(/HOME_HREF = '\/celo-sepolia'/)
  })

  it('offers a single nav item to the agent page', () => {
    expect(source).toContain('For Agents')
    expect(source).toMatch(/href="\/keys"/)
  })

  it('keeps the logo out of the right-hand controls', () => {
    // The logo must stay on the left of the flex row, not beside the toggles.
    const rightHandSide = source.slice(source.indexOf('flex flex-row'))
    expect(rightHandSide).not.toContain('<Logo />')
  })
})

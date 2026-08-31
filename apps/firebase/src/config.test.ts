import { describe, expect, it } from 'vitest'
import { getNetworkConfig } from './config'

const CELO = BigInt(10) ** BigInt(18)

/**
 * Payout amounts are a funding decision, not an implementation detail, so
 * they are pinned here: changing one should be deliberate and should force
 * the on-page copy in apps/web/pages/[chain].tsx to be revisited with it.
 */
describe('celo-sepolia payout amounts', () => {
  const config = getNetworkConfig('celo-sepolia')

  // Raised from 0.3: at Celo Sepolia's 50 gwei floor that bought only about
  // two contract deployments, which a first session could exhaust.
  it('pays 1 CELO unauthenticated', () => {
    expect(config.faucetGoldAmount).toBe(CELO)
  })

  it('pays 3 CELO authenticated', () => {
    expect(config.authenticatedGoldAmount).toBe(BigInt(3) * CELO)
  })

  // The on-page rules state this multiple; if it moves, that copy is wrong.
  it('keeps the authenticated tier at 3x the unauthenticated one', () => {
    expect(config.authenticatedGoldAmount / config.faucetGoldAmount).toBe(
      BigInt(3),
    )
  })

  it('keeps authenticated strictly better than unauthenticated', () => {
    expect(config.authenticatedGoldAmount).toBeGreaterThan(
      config.faucetGoldAmount,
    )
  })
})

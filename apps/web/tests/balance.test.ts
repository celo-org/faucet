import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isAddress } from 'viem'
import { FAUCET_POOL_ADDRESSES } from 'types'
import { isBalanceBelowPar } from 'utils/balance'

const CELO = (n: number) => String(BigInt(n) * BigInt(10) ** BigInt(18))
const urls: string[] = []

function mockBlockscout(bodies: Array<{ result: string | null }>) {
  let i = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      urls.push(String(url))
      const body = bodies[Math.min(i++, bodies.length - 1)]
      return { json: async () => body } as Response
    }),
  )
}

describe('isBalanceBelowPar', () => {
  beforeEach(() => {
    urls.length = 0
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // Regression: the host was built as `celo-${network}`, producing
  // celo-celo-sepolia.blockscout.com, which 404s. Every call threw, the catch
  // swallowed it, and the banner could never fire.
  it('calls a Blockscout host that exists', async () => {
    mockBlockscout([{ result: CELO(100) }])
    await isBalanceBelowPar('celo-sepolia')

    expect(urls[0]).toContain('https://celo-sepolia.blockscout.com/api')
    expect(urls[0]).not.toContain('celo-celo-sepolia')
  })

  // Regression: it watched an address that has never paid a request out.
  it('queries the accounts that actually dispatch payouts', async () => {
    mockBlockscout([{ result: CELO(100) }])
    await isBalanceBelowPar('celo-sepolia')

    for (const address of FAUCET_POOL_ADDRESSES['celo-sepolia']) {
      expect(urls.some((u) => u.includes(address))).toBe(true)
    }
    // The old constant holds ~0.09 CELO and would report a funded faucet empty.
    expect(urls.join()).not.toContain(
      '0x22579CA45eE22E2E16dDF72D955D6cf4c767B0eF',
    )
  })

  // Regression: the address was hand-cased and failed EIP-55. Blockscout is
  // case-insensitive so it still worked, but anything using viem would reject
  // it, and it is simply the wrong string.
  it('lists only valid checksummed addresses', () => {
    for (const address of FAUCET_POOL_ADDRESSES['celo-sepolia']) {
      expect(isAddress(address, { strict: true })).toBe(true)
    }
  })

  it('lists at least one pool account', () => {
    expect(FAUCET_POOL_ADDRESSES['celo-sepolia'].length).toBeGreaterThan(0)
  })

  it('reports healthy when the pool is funded', async () => {
    mockBlockscout([{ result: CELO(100) }])
    await expect(isBalanceBelowPar('celo-sepolia')).resolves.toBe(false)
  })

  it('reports low when the pool is drained', async () => {
    mockBlockscout([{ result: '1000' }])
    await expect(isBalanceBelowPar('celo-sepolia')).resolves.toBe(true)
  })

  // Unknown must not be reported as empty, or a Blockscout outage would post a
  // false "out of CELO" notice across the site.
  it('treats a Blockscout error as funded', async () => {
    mockBlockscout([{ result: null }])
    await expect(isBalanceBelowPar('celo-sepolia')).resolves.toBe(false)
  })

  it('treats a network failure as funded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down')
      }),
    )
    await expect(isBalanceBelowPar('celo-sepolia')).resolves.toBe(false)
  })
})

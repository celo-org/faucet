import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { hashIp } from './metrics'

const IP = '203.0.113.47'

describe('hashIp', () => {
  beforeEach(() => {
    process.env.FAUCET_API_KEY_PEPPER = 'test-pepper'
  })
  afterEach(() => {
    process.env.FAUCET_API_KEY_PEPPER = 'test-pepper'
  })

  it('is stable for the same address', () => {
    expect(hashIp(IP)).toBe(hashIp(IP))
  })

  it('distinguishes different addresses', () => {
    expect(hashIp(IP)).not.toBe(hashIp('203.0.113.48'))
  })

  it('returns undefined for a missing address', () => {
    expect(hashIp(undefined)).toBeUndefined()
  })

  // Regression: an unsalted digest over the 2^32 IPv4 space is reversible by
  // brute force in well under an hour on a single core, so the output must not
  // be derivable from the address alone.
  it('is not a bare digest of the address', () => {
    const bare = createHash('sha256').update(IP).digest('hex')
    expect(hashIp(IP)).not.toBe(bare.slice(0, 16))
    expect(bare).not.toContain(hashIp(IP) as string)
  })

  it('changes with the pepper, so the log is not reversible without it', () => {
    const withA = hashIp(IP)
    process.env.FAUCET_API_KEY_PEPPER = 'a-different-pepper'
    expect(hashIp(IP)).not.toBe(withA)
  })

  // Better to drop the field than to log something that looks anonymised.
  it('omits the value entirely when no pepper is configured', () => {
    delete process.env.FAUCET_API_KEY_PEPPER
    expect(hashIp(IP)).toBeUndefined()
  })
})

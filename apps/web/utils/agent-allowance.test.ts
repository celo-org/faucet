import { describe, expect, it } from 'vitest'
import {
  AGENT_ESTABLISHED_AFTER_DAYS,
  AGENT_RATE_LIMITS,
  agentRateLimit,
  agentTier,
} from './agent-allowance'

const DAY = 24 * 60 * 60 * 1000
const NOW = 1_800_000_000_000

describe('agent allowance by age', () => {
  it('treats a freshly registered agent as new', () => {
    expect(agentTier(NOW - DAY, NOW)).toBe('new')
    expect(agentRateLimit(NOW - DAY, NOW)).toEqual(AGENT_RATE_LIMITS.new)
  })

  it('promotes an agent once it has existed long enough', () => {
    const old = NOW - AGENT_ESTABLISHED_AFTER_DAYS * DAY
    expect(agentTier(old, NOW)).toBe('established')
    expect(agentRateLimit(old, NOW)).toEqual(AGENT_RATE_LIMITS.established)
  })

  it('is a strict threshold: one millisecond short is still new', () => {
    expect(agentTier(NOW - AGENT_ESTABLISHED_AFTER_DAYS * DAY + 1, NOW)).toBe(
      'new',
    )
  })

  /**
   * The conservative reading. If the explorer that supplies the timestamp was
   * unreachable at mint, the agent is not handed the larger allowance on
   * trust.
   */
  it('treats an unknown registration time as new', () => {
    expect(agentTier(undefined, NOW)).toBe('new')
    expect(agentTier(Number.NaN, NOW)).toBe('new')
  })

  it('gives a new agent strictly less than an established one', () => {
    expect(AGENT_RATE_LIMITS.new.count).toBeLessThan(
      AGENT_RATE_LIMITS.established.count,
    )
    // Twenty throwaway registrations must not reach the shared programmatic
    // daily ceiling of 200 on their own.
    expect(AGENT_RATE_LIMITS.new.count * 20).toBeLessThan(200)
  })
})

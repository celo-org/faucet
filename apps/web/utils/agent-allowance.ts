/**
 * How much an agent-held key may draw per day, by the age of the agent.
 *
 * Registering an ERC-8004 agent costs a fraction of a cent, so "one agent, one
 * allowance" would let a single wallet mint twenty identities and fill the
 * shared programmatic ceiling that GitHub-key holders also draw on. Age is
 * the cheapest thing an attacker cannot buy: a freshly registered agent gets
 * a small allowance, and one that has existed for a while gets the same as a
 * signed-in human. The allowance is decided at request time from the
 * registration timestamp recorded on the key, so an agent grows into the
 * larger tier without minting a new key.
 */

export type AgentRateLimit = Readonly<{
  count: number
  timePeriodInSeconds: number
}>

const DAY_SECONDS = 24 * 60 * 60
const DAY_MS = DAY_SECONDS * 1000

/** Days since registration after which an agent counts as established. */
export const AGENT_ESTABLISHED_AFTER_DAYS = 7

export type AgentTier = 'new' | 'established'

export const AGENT_RATE_LIMITS: Record<AgentTier, AgentRateLimit> = {
  new: { count: 2, timePeriodInSeconds: DAY_SECONDS },
  // Matches RATE_LIMITS[AuthLevel.authenticated]: an established agent is
  // trusted like a signed-in person, no more.
  established: { count: 10, timePeriodInSeconds: DAY_SECONDS },
}

/**
 * An agent whose registration time is unknown is treated as new. That is the
 * conservative reading when the explorer that supplies the timestamp is
 * unreachable at mint time, and it costs an honest agent nothing it cannot
 * recover by minting again once the lookup succeeds.
 */
export function agentTier(
  registeredAt: number | undefined,
  now = Date.now(),
): AgentTier {
  if (registeredAt === undefined || !Number.isFinite(registeredAt)) {
    return 'new'
  }
  return now - registeredAt >= AGENT_ESTABLISHED_AFTER_DAYS * DAY_MS
    ? 'established'
    : 'new'
}

export function agentRateLimit(
  registeredAt: number | undefined,
  now = Date.now(),
): AgentRateLimit {
  return AGENT_RATE_LIMITS[agentTier(registeredAt, now)]
}

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthLevel, RequestStatus } from 'types'
import { AdmissionChannel } from './metrics'

const push = vi.hoisted(() =>
  vi.fn(async (_record: Record<string, unknown>) => ({ key: 'push-key-1' })),
)
const ref = vi.hoisted(() => vi.fn(() => ({ push })))
const hlen = vi.hoisted(() => vi.fn(async (_path: string) => 0))
const exec = vi.hoisted(() => vi.fn(async () => []))
const hsetnx = vi.hoisted(() => vi.fn())
const hexpire = vi.hoisted(() => vi.fn())
const getBalance = vi.hoisted(() => vi.fn(async () => 0n))
const readContract = vi.hoisted(() => vi.fn(async () => 0n))

vi.mock('firebase/compat/app', () => ({
  default: { apps: [{}], database: () => ({ ref }) },
}))
vi.mock('firebase/compat/auth', () => ({}))
vi.mock('firebase/compat/database', () => ({}))

vi.mock('./redis', () => ({
  getRedis: () => ({
    hlen,
    multi: () => ({ hsetnx, expire: vi.fn(), hexpire, exec }),
  }),
}))

vi.mock('viem', async (importActual) => ({
  ...(await importActual<typeof import('viem')>()),
  createPublicClient: () => ({ getBalance, readContract }),
}))

import {
  PROGRAMMATIC_GLOBAL_LIMIT,
  RATE_LIMITS,
  sendRequest,
} from './firebase.serverside'

const ADDRESS = '0x22579CA45eE22E2E16dDF72D955D6cf4c767B0eF'
const WEI = 10n ** 18n

function pushedRecord() {
  return push.mock.calls[0][0]
}

/** Bucket paths touched by the write transaction. */
function writtenPaths() {
  return hsetnx.mock.calls.map(([path]) => String(path))
}

function base(overrides = {}) {
  return {
    address: ADDRESS,
    skipStables: true,
    network: 'celo-sepolia' as const,
    authLevel: AuthLevel.none,
    channel: AdmissionChannel.browser,
    ...overrides,
  }
}

describe('sendRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hlen.mockResolvedValue(0)
    getBalance.mockResolvedValue(0n)
    readContract.mockResolvedValue(0n)
  })

  it('enqueues a Pending Celo request and returns the push key', async () => {
    const result = await sendRequest(base({ ip: '203.0.113.7' }))

    expect(result).toEqual({ key: 'push-key-1' })
    expect(ref).toHaveBeenCalledWith('celo-sepolia/requests')
    expect(pushedRecord()).toMatchObject({
      beneficiary: ADDRESS,
      status: RequestStatus.Pending,
      authLevel: AuthLevel.none,
    })
  })

  // Regression: newRequest used to be built before the elevation ran, so the
  // queued record kept authLevel 'none' and the payout stayed at 0.3 CELO.
  it('records the elevated authLevel when the beneficiary holds mainnet ETH', async () => {
    getBalance.mockResolvedValue(WEI / 100n) // exactly 0.01 ETH
    await sendRequest(base())

    expect(pushedRecord().authLevel).toBe(AuthLevel.authenticated)
  })

  it('records the elevated authLevel when the beneficiary has LockedCELO', async () => {
    readContract.mockResolvedValue(100n * WEI)
    await sendRequest(base())

    expect(pushedRecord().authLevel).toBe(AuthLevel.authenticated)
  })

  it('leaves authLevel none when the address is below both thresholds', async () => {
    getBalance.mockResolvedValue(WEI / 200n)
    readContract.mockResolvedValue(99n * WEI)
    await sendRequest(base())

    expect(pushedRecord().authLevel).toBe(AuthLevel.none)
  })

  it('rate limits without enqueuing once the beneficiary is at its cap', async () => {
    hlen.mockImplementation(async (key: string) =>
      key.includes(ADDRESS) ? RATE_LIMITS[AuthLevel.none].count : 0,
    )

    const result = await sendRequest(base())

    expect(result).toMatchObject({
      reason: 'rate_limited',
      bucket: 'beneficiary',
      limit: RATE_LIMITS[AuthLevel.none].count,
    })
    expect(push).not.toHaveBeenCalled()
  })

  // Regression: the user bucket TTL was hardcoded to the authenticated period.
  it('expires the user bucket using the period for the request authLevel', async () => {
    await sendRequest(base({ ip: '203.0.113.7', userId: 'user-hash' }))

    const userCall = hexpire.mock.calls.find(([key]) =>
      String(key).endsWith('user-hash'),
    )
    expect(userCall?.[2]).toBe(RATE_LIMITS[AuthLevel.none].timePeriodInSeconds)
  })

  describe('browser channel', () => {
    it('counts against the shared global and per-IP buckets', async () => {
      await sendRequest(base({ ip: '203.0.113.7' }))

      expect(writtenPaths()).toEqual(
        expect.arrayContaining([
          'rate-limits:global',
          'ip-counts:203.0.113.7',
          `rate-limits:${ADDRESS}`,
        ]),
      )
      expect(writtenPaths()).not.toContain('api-key-counts:global')
    })
  })

  describe('api-key channel', () => {
    const keyed = () =>
      base({
        channel: AdmissionChannel.apiKey,
        authLevel: AuthLevel.authenticated,
        userId: 'owner-hash',
        ip: '203.0.113.7',
      })

    it('uses its own global ceiling and skips the IP bucket', async () => {
      await sendRequest(keyed())
      const paths = writtenPaths()

      expect(paths).toContain('api-key-counts:global')
      expect(paths).not.toContain('rate-limits:global')
      expect(paths).not.toContain('ip-counts:203.0.113.7')
    })

    // Minting a key must not create a second quota.
    it('still counts against the owner and beneficiary buckets', async () => {
      await sendRequest(keyed())

      expect(writtenPaths()).toEqual(
        expect.arrayContaining([
          'rate-limits:owner-hash',
          `rate-limits:${ADDRESS}`,
        ]),
      )
    })

    it('rate limits when the owner identity is already at its cap', async () => {
      hlen.mockImplementation(async (key: string) =>
        key.endsWith('owner-hash')
          ? RATE_LIMITS[AuthLevel.authenticated].count
          : 0,
      )

      await expect(sendRequest(keyed())).resolves.toMatchObject({
        reason: 'rate_limited',
        bucket: 'user',
      })
      expect(push).not.toHaveBeenCalled()
    })

    it('rate limits on the programmatic global ceiling', async () => {
      hlen.mockImplementation(async (key: string) =>
        key === 'api-key-counts:global' ? PROGRAMMATIC_GLOBAL_LIMIT.count : 0,
      )

      await expect(sendRequest(keyed())).resolves.toMatchObject({
        reason: 'rate_limited',
        bucket: 'programmatic-global',
      })
    })

    it('honours PROGRAMMATIC_GLOBAL_DAILY_LIMIT from the environment', async () => {
      process.env.PROGRAMMATIC_GLOBAL_DAILY_LIMIT = '5'
      hlen.mockImplementation(async (key: string) =>
        key === 'api-key-counts:global' ? 5 : 0,
      )

      await expect(sendRequest(keyed())).resolves.toMatchObject({
        reason: 'rate_limited',
        bucket: 'programmatic-global',
        limit: 5,
      })
      delete process.env.PROGRAMMATIC_GLOBAL_DAILY_LIMIT
    })
  })
})

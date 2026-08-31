import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DataSnapshot } from 'firebase-admin/database'
import {
  AuthLevel,
  AccountPool,
  RequestRecord,
  RequestStatus,
  RequestType,
  processRequest,
} from './database-helper'
import { NetworkConfig } from './config'

const transferCelo = vi.hoisted(() => vi.fn(async () => '0xdeadbeef'))
vi.mock('./celo-adapter', () => ({
  CeloAdapter: class {
    transferCelo = transferCelo
  },
}))
vi.mock('./metrics', () => ({
  ExecutionResult: {
    Ok: 'Ok',
    InvalidRequestErr: 'InvalidRequestErr',
    NoFreeAccountErr: 'NoFreeAccountErr',
    ActionTimedOutErr: 'ActionTimedOutErr',
    OtherErr: 'OtherErr',
  },
  logExecutionResult: vi.fn(),
}))

const CONFIG: NetworkConfig = {
  nodeUrl: 'https://forno.celo-sepolia.celo-testnet.org',
  faucetGoldAmount: 300_000_000_000_000_000n,
  authenticatedGoldAmount: 3_000_000_000_000_000_000n,
}

function makeSnap(request: RequestRecord) {
  const update = vi.fn(async (_patch: Record<string, unknown>) => undefined)
  return {
    snap: {
      key: 'req-1',
      val: () => request,
      ref: { update },
    } as unknown as DataSnapshot,
    update,
  }
}

/** Runs the sender against a single unlocked account. */
function makePool() {
  return {
    doWithAccount: async (
      action: (account: {
        pk: string
        address: string
        locked: boolean
      }) => Promise<void>,
    ) => {
      await action({ pk: '0xpk', address: '0xfrom', locked: false })
      // ActionResult.Ok — a non-exported numeric enum, so the value is used.
      return 0
    },
  } as unknown as AccountPool
}

const pendingRequest: RequestRecord = {
  beneficiary: '0x22579CA45eE22E2E16dDF72D955D6cf4c767B0eF',
  status: RequestStatus.Pending,
  type: RequestType.Faucet,
  authLevel: AuthLevel.none,
}

describe('processRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    transferCelo.mockResolvedValue('0xdeadbeef')
  })

  // Regression: the tx hash used to be written as `celoTxhash`, which no
  // consumer reads, leaving the explorer link in the UI permanently empty.
  it('records the transaction hash as goldTxHash', async () => {
    const { snap, update } = makeSnap(pendingRequest)

    await processRequest(snap, makePool(), CONFIG)

    const written = Object.assign({}, ...update.mock.calls.map(([arg]) => arg))
    expect(written.goldTxHash).toBe('0xdeadbeef')
    expect(written).not.toHaveProperty('celoTxhash')
  })

  it('marks the request Working then Done', async () => {
    const { snap, update } = makeSnap(pendingRequest)

    await processRequest(snap, makePool(), CONFIG)

    const statuses = update.mock.calls
      .map(([patch]) => patch.status)
      .filter(Boolean)
    expect(statuses).toEqual([RequestStatus.Working, RequestStatus.Done])
  })

  it('sends the unauthenticated amount for an AuthLevel.none request', async () => {
    const { snap } = makeSnap(pendingRequest)

    await processRequest(snap, makePool(), CONFIG)

    expect(transferCelo).toHaveBeenCalledWith(
      pendingRequest.beneficiary,
      CONFIG.faucetGoldAmount,
    )
  })

  // The payout half of the elevation fix on the web side.
  it('sends the authenticated amount for an elevated request', async () => {
    const { snap } = makeSnap({
      ...pendingRequest,
      authLevel: AuthLevel.authenticated,
    })

    await processRequest(snap, makePool(), CONFIG)

    expect(transferCelo).toHaveBeenCalledWith(
      pendingRequest.beneficiary,
      CONFIG.authenticatedGoldAmount,
    )
  })

  it('ignores a request that is not Pending', async () => {
    const { snap, update } = makeSnap({
      ...pendingRequest,
      status: RequestStatus.Done,
    })

    await processRequest(snap, makePool(), CONFIG)

    expect(update).not.toHaveBeenCalled()
    expect(transferCelo).not.toHaveBeenCalled()
  })
})

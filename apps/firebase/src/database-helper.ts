/* tslint:disable max-classes-per-file */
import { CeloTransactionObject } from '@celo/connect'
import { retryAsync, sleep } from '@celo/utils/lib/async'
import { database } from 'firebase-admin'
import { database as functionsDB } from 'firebase-functions'
import { CeloAdapter } from './celo-adapter'
import { NetworkConfig } from './config'
import { ExecutionResult, logExecutionResult } from './metrics'

type DataSnapshot = functionsDB.DataSnapshot

export type Address = string
export interface AccountRecord {
  pk: string
  address: Address
  locked: boolean
}

export enum AuthLevel {
  none = 'none',
  authenticated = 'authenticated',
}

export enum RequestStatus {
  Pending = 'Pending',
  Working = 'Working',
  Done = 'Done',
  Failed = 'Failed',
}

export enum RequestType {
  Faucet = 'Faucet',
}

export interface RequestRecord {
  beneficiary: Address
  status: RequestStatus
  type: RequestType
  dollarTxHash?: string
  goldTxHash?: string
  tokens?: RequestedTokenSet
  authLevel: AuthLevel
}

enum RequestedTokenSet {
  All = 'All',
  Stables = 'Stables',
  Celo = 'Celo',
}

export async function processRequest(
  snap: DataSnapshot,
  pool: AccountPool,
  config: NetworkConfig,
) {
  const request = snap.val() as RequestRecord
  if (request.status !== RequestStatus.Pending) {
    return
  }

  await snap.ref.update({ status: RequestStatus.Working })
  console.info(
    `req(${snap.key}): Started working on ${request.type} request for:${request.beneficiary}`,
  )

  try {
    let requestHandler
    if (request.type === RequestType.Faucet) {
      requestHandler = buildHandleFaucet(request, snap, config)
    } else {
      logExecutionResult(snap.key, ExecutionResult.InvalidRequestErr)
      return ExecutionResult.InvalidRequestErr
    }

    const actionResult = await pool.doWithAccount(requestHandler)
    if (actionResult === ActionResult.Ok) {
      await snap.ref.update({ status: RequestStatus.Done })
      logExecutionResult(snap.key, ExecutionResult.Ok)
      return ExecutionResult.Ok
    } else {
      await snap.ref.update({ status: RequestStatus.Failed })
      const result =
        actionResult === ActionResult.NoFreeAccount
          ? ExecutionResult.NoFreeAccountErr
          : ExecutionResult.ActionTimedOutErr
      logExecutionResult(snap.key, result)
      return result
    }
  } catch (err) {
    logExecutionResult(snap.key, ExecutionResult.OtherErr)
    console.error(`req(${snap.key}): ERROR proccessRequest`, err)
    await snap.ref.update({ status: RequestStatus.Failed })
    throw err
  }
}


async function sendCelo(celo: CeloAdapter, to: string, amountInWei: string) {
  const goldTx = await celo.transferGold(to, amountInWei)
  const goldTxReceipt = await goldTx.sendAndWaitForReceipt()
  return goldTxReceipt.transactionHash
}

function buildHandleFaucet(
  request: RequestRecord,
  snap: DataSnapshot,
  config: NetworkConfig,
) {
  return async (account: AccountRecord) => {
    const { nodeUrl } = config
    const { goldAmount, stableAmount } = getSendAmounts(
      request.authLevel,
      config,
    )
    const celo = new CeloAdapter({ nodeUrl, pk: account.pk })
    await celo.init()

    if (
      request.tokens === 'Celo' ||
      request.tokens === 'All' ||
      request.tokens === undefined
    ) {
      await retryAsync(
        sendGold,
        3,
        [celo, request.beneficiary, goldAmount, snap],
        500,
      )
    }

    if (
      request.tokens === 'Stables' ||
      request.tokens === 'All' ||
      request.tokens === undefined
    ) {
      await sendStableTokens(
        celo,
        request.beneficiary,
        stableAmount,
        false,
        snap,
      )
    }
  }
}

function getSendAmounts(
  authLevel: AuthLevel,
  config: NetworkConfig,
): { goldAmount: string; stableAmount: string } {
  switch (authLevel) {
    case undefined:
    case AuthLevel.none:
      return {
        goldAmount: config.faucetGoldAmount,
        stableAmount: config.faucetStableAmount,
      }
    case AuthLevel.authenticated:
      return {
        goldAmount: config.authenticatedGoldAmount,
        stableAmount: config.authenticatedStableAmount,
      }
  }
}

async function sendGold(
  celo: CeloAdapter,
  address: Address,
  amount: string,
  snap: DataSnapshot,
) {
  const token = await celo.kit.contracts.getGoldToken()

  const recipientBalance = await token.balanceOf(address)

  const actualAmount = celo.fadeOutAmount(recipientBalance, amount, false)

  console.info(
    `req(${
      snap.key
    }): Sending ${actualAmount.toString()} celo to ${address} (balance ${recipientBalance.toString()})`,
  )
  if (actualAmount.eq(0)) {
    console.info(`req(${snap.key}): CELO Transaction SKIPPED`)
    await snap.ref.update({ goldTxHash: 'skipped' })
    return 'skipped'
  }
  const goldTxHash = await sendCelo(celo, address, actualAmount.toFixed())
  console.info(`req(${snap.key}): CELO Transaction Sent. txhash:${goldTxHash}`)
  await snap.ref.update({ goldTxHash })
  return goldTxHash
}

async function sendStableTokens(
  celo: CeloAdapter,
  address: Address,
  amount: string,
  alwaysUseFullAmount: boolean, // when false if the recipient already has a sizeable balance the amount will gradually be reduced to zero
  snap: DataSnapshot | { key: string; ref?: undefined },
) {
  const tokenTxs = await celo.transferStableTokens(
    address,
    amount,
    alwaysUseFullAmount,
  )

  const sendTxHelper = async (
    symbol: string,
    tx: CeloTransactionObject<boolean>,
  ) => {
    const txReceipt = await tx.sendAndWaitForReceipt()
    const txHash = txReceipt.transactionHash
    console.log(
      `req(${snap.key}): ${symbol} Transaction Sent.  txhash:${txHash}`,
    )
    if (snap.ref) {
      await snap.ref.update({ txHash })
    }
    return txHash
  }

  for (const [symbol, tx] of Object.entries(tokenTxs)) {
    try {
      if (tx) {
        await retryAsync(sendTxHelper, 3, [symbol, tx!], 500)
      }
    } catch (e) {
      // Log that one transfer failed. if error is not caught it looks like all failed
      console.log(
        `req(${snap.key}): tx=>${tx} ${symbol} Transaction Failed. ${e}`,
      )
    }
  }
}

function withTimeout<A>(
  timeout: number,
  fn: () => Promise<A>,
  onTimeout?: () => A | Promise<A>,
): Promise<A> {
  return new Promise((resolve, reject) => {
    let timeoutHandler: NodeJS.Timeout | null = setTimeout(() => {
      timeoutHandler = null

      if (onTimeout) {
        resolve(onTimeout())
      } else {
        reject(new Error(`Timeout after ${timeout} ms`))
      }
    }, timeout)

    fn()
      .then((val) => {
        if (timeoutHandler !== null) {
          clearTimeout(timeoutHandler)
          resolve(val)
        }
      })
      .catch((err) => {
        if (timeoutHandler !== null) {
          clearTimeout(timeoutHandler)
          reject(err)
        }
      })
  })
}

export interface PoolOptions {
  retryWaitMS: number
  getAccountTimeoutMS: number
  actionTimeoutMS: number
}

const SECOND = 1000

enum ActionResult {
  Ok,
  NoFreeAccount,
  ActionTimeout,
}
export class AccountPool {
  constructor(
    private db: database.Database,
    public network: string,
    private options: PoolOptions = {
      getAccountTimeoutMS: 10 * SECOND,
      retryWaitMS: 3000,
      actionTimeoutMS: 50 * SECOND,
    },
  ) {
    // is empty.
  }

  get accountsRef() {
    let network = this.network

    // TODO temp as they share accounts
    if (network === 'dango') {
      network = 'alfajores'
    }

    return this.db.ref(`/${network}/accounts`)
  }

  removeAll() {
    return this.accountsRef.remove()
  }

  addAccount(account: AccountRecord) {
    return this.accountsRef.push(account)
  }

  getAccounts() {
    return this.accountsRef.once('value').then((snap) => snap.val())
  }

  async doWithAccount(
    action: (account: AccountRecord) => Promise<any>,
  ): Promise<ActionResult> {
    const accountSnap = await this.tryLockAccountWithRetries()
    if (!accountSnap) {
      return ActionResult.NoFreeAccount
    }

    try {
      return withTimeout(
        this.options.actionTimeoutMS,
        async () => {
          await action(accountSnap.val())
          return ActionResult.Ok
        },
        () => ActionResult.ActionTimeout,
      )
    } finally {
      await accountSnap.child('locked').ref.set(false)
    }
  }

  async tryLockAccountWithRetries() {
    let end = false
    let retries = 0

    const loop = async () => {
      while (!end) {
        const acc = await this.tryLockAccount()
        if (acc != null) {
          return acc
        } else {
          await sleep(this.options.retryWaitMS)
          retries++
        }
      }
      return null
    }

    const onTimeout = () => {
      end = true
      return null
    }

    const account = await withTimeout(
      this.options.getAccountTimeoutMS,
      loop,
      onTimeout,
    )

    if (account) {
      console.info(
        `LockAccount: ${account.val().address} (after ${retries - 1} retries)`,
      )
    } else {
      console.warn(`LockAccount: Failed`)
    }
    return account
  }

  async tryLockAccount(): Promise<null | database.DataSnapshot> {
    const accountsSnap = await this.accountsRef.once('value')

    const accountKeys: string[] = []
    accountsSnap.forEach((accSnap) => {
      accountKeys.push(accSnap.key!)
    })

    for (const key of accountKeys) {
      const lockPath = accountsSnap.child(key + '/locked')
      if (!lockPath.val() && (await this.trySetLockField(lockPath.ref))) {
        return accountsSnap.child(key)
      }
    }

    return null
  }

  /**
   * Try to set `locked` field to true.
   *
   * @param lockRef Reference to lock field
   * @returns Wether it sucessfully updated the field
   */
  private async trySetLockField(lockRef: database.Reference) {
    const txres = await lockRef.transaction((curr: boolean) => {
      if (curr) {
        return // already locked, abort
      } else {
        return true
      }
    })
    return txres.committed
  }
}

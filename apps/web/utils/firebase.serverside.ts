import { lockedGoldABI } from '@celo/abis'
import firebase from 'firebase/compat/app'
import 'firebase/compat/auth'
import 'firebase/compat/database'
import {
  Address,
  AuthLevel,
  Network,
  RequestedTokenSet,
  RequestRecord,
  RequestStatus,
  RequestType,
} from 'types'
import { createPublicClient, fallback, getAddress, http } from 'viem'
import { celo, mainnet } from 'viem/chains'
import { config } from './firebase-config'
import { AdmissionChannel } from './metrics'
import { getRedis } from './redis'

async function getFirebase() {
  if (!firebase.apps.length) {
    firebase.initializeApp(config)
    const loginUsername = process.env.FIREBASE_LOGIN_USERNAME
    const loginPassword = process.env.FIREBASE_LOGIN_PASSWORD
    if (
      loginUsername === undefined ||
      loginUsername === null ||
      loginUsername.length === 0 ||
      loginPassword === undefined
    ) {
      throw new Error('Login username or password is empty')
    }
    try {
      // Source: https://firebase.google.com/docs/auth
      await firebase
        .auth()
        .signInWithEmailAndPassword(loginUsername, loginPassword)
    } catch (e) {
      console.error(`Fail to login into Firebase: ${e}`)
      throw e
    }
  }
  return firebase
}

async function getDB(): Promise<firebase.database.Database> {
  return (await getFirebase()).database()
}

type RateLimit = Readonly<{ count: number; timePeriodInSeconds: number }>

const SECONDS = 1
const MINUTES = 60 * SECONDS
const HOURS = 60 * MINUTES
export const RATE_LIMITS: Record<string, RateLimit> = {
  [AuthLevel.none]: { count: 4, timePeriodInSeconds: 24 * HOURS },
  [AuthLevel.authenticated]: { count: 10, timePeriodInSeconds: 24 * HOURS },
}

export const GLOBAL_RATE_LIMITS: Record<string, RateLimit> = {
  [AuthLevel.none]: { count: 3, timePeriodInSeconds: 10 * MINUTES },
  [AuthLevel.authenticated]: { count: 15, timePeriodInSeconds: 10 * MINUTES },
}

export const RATE_LIMITS_PER_IP: RateLimit = {
  count: 18, // authenticated + none*2
  timePeriodInSeconds: 24 * HOURS,
}

function envCount(name: string, fallback: number): number {
  const parsed = Number(process.env[name])
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

/**
 * Daily ceiling across every API key, kept separate from GLOBAL_RATE_LIMITS so
 * programmatic traffic can never starve the browser path. This is the number
 * that bounds a total key compromise.
 */
export const PROGRAMMATIC_GLOBAL_LIMIT: RateLimit = {
  get count() {
    return envCount('PROGRAMMATIC_GLOBAL_DAILY_LIMIT', 200)
  },
  timePeriodInSeconds: 24 * HOURS,
}

/**
 * Short concurrency window for keyed traffic.
 *
 * The daily ceiling bounds total spend but says nothing about arrival rate.
 * Without this, a day's worth of keyed requests can land at once, lock every
 * account in the payout pool and starve the browser path with
 * NoFreeAccountErr. It mirrors GLOBAL_RATE_LIMITS, which is the equivalent
 * concurrency guard on the browser path.
 */
export const PROGRAMMATIC_BURST_LIMIT: RateLimit = {
  get count() {
    return envCount('PROGRAMMATIC_BURST_LIMIT', 20)
  },
  timePeriodInSeconds: 10 * MINUTES,
}

export type RateLimitBucket =
  | 'global'
  | 'beneficiary'
  | 'ip'
  | 'user'
  | 'programmatic-global'
  | 'programmatic-burst'

interface Bucket {
  name: RateLimitBucket
  path: string
  limit: RateLimit
}

export interface SendRequestParams {
  address: Address
  skipStables: boolean
  network: Network
  authLevel: AuthLevel
  channel: AdmissionChannel
  ip?: string
  /** sha256 of the GitHub email. Shared by the browser and API-key paths. */
  userId?: string
}

export interface SendRequestResult {
  key?: string
  reason?: 'rate_limited'
  /** Which cap was hit, for logging. */
  bucket?: RateLimitBucket
  count?: number
  limit?: number
}

export async function sendRequest({
  address,
  skipStables,
  network,
  authLevel,
  channel,
  ip,
  userId,
}: SendRequestParams): Promise<SendRequestResult> {
  // NOTE: make sure address is stable (no lowercase/not-prefixed BS)
  const beneficiary = getAddress(
    address.startsWith('0x') ? address : `0x${address}`,
  )

  try {
    if (await addressCanBeElevatedToTrusted(beneficiary)) {
      authLevel = AuthLevel.authenticated
    }

    // Built after the elevation above: capturing authLevel any earlier records
    // the pre-elevation value on the queued request, so a trusted address is
    // paid faucetGoldAmount instead of authenticatedGoldAmount.
    const newRequest: RequestRecord = {
      beneficiary,
      status: RequestStatus.Pending,
      type: RequestType.Faucet,
      tokens: skipStables ? RequestedTokenSet.Celo : RequestedTokenSet.All,
      authLevel,
    }

    const db = await getDB()
    const redis = getRedis()
    const namespace = 'rate-limits'
    const ipNamespace = 'ip-counts'
    const programmatic = channel === AdmissionChannel.apiKey

    const buckets: Bucket[] = []
    if (programmatic) {
      buckets.push({
        name: 'programmatic-burst',
        path: `api-key-counts:burst`,
        limit: PROGRAMMATIC_BURST_LIMIT,
      })
      buckets.push({
        name: 'programmatic-global',
        path: `api-key-counts:global`,
        limit: PROGRAMMATIC_GLOBAL_LIMIT,
      })
    } else {
      buckets.push({
        name: 'global',
        path: `${namespace}:global`,
        limit: GLOBAL_RATE_LIMITS[authLevel],
      })
      // Skipped for keyed requests: CI runners and agent hosts share egress
      // IPs, and the key owner is already the identity being limited.
      buckets.push({
        name: 'ip',
        path: `${ipNamespace}:${ip}`,
        limit: RATE_LIMITS_PER_IP,
      })
    }
    if (userId) {
      buckets.push({
        name: 'user',
        path: `${namespace}:${userId}`,
        limit: RATE_LIMITS[authLevel],
      })
    }
    buckets.push({
      name: 'beneficiary',
      path: `${namespace}:${beneficiary}`,
      limit: RATE_LIMITS[authLevel],
    })

    const counts = await Promise.all(
      buckets.map((bucket) => redis.hlen(bucket.path)),
    )

    for (const [i, bucket] of buckets.entries()) {
      if (counts[i] >= bucket.limit.count) {
        return {
          reason: 'rate_limited',
          bucket: bucket.name,
          count: counts[i],
          limit: bucket.limit.count,
        }
      }
    }

    const ref: firebase.database.Reference = await db
      .ref(`${network}/requests`)
      .push(newRequest)

    /// BEGIN TRANSACTION
    const tx = redis.multi()
    for (const bucket of buckets) {
      tx.hsetnx(bucket.path, ref.key!, 1)
      tx.expire(bucket.path, bucket.limit.timePeriodInSeconds)
      tx.hexpire(bucket.path, ref.key!, bucket.limit.timePeriodInSeconds)
    }
    await tx.exec()
    /// END TRANSACTION

    return { key: ref.key! }
  } catch (e) {
    console.error(`Error while sendRequest: ${e}`)
    throw e
  }
}

/** Legacy field name written before the goldTxHash fix. */
type StoredRequestRecord = RequestRecord & { celoTxhash?: string }

export async function getRequestRecord(
  key: string,
  network: Network,
): Promise<StoredRequestRecord | undefined> {
  const db = await getDB()
  const snap = await db.ref(`${network}/requests/${key}`).once('value')
  return snap.val() ?? undefined
}

const ethPublicClient = createPublicClient({
  transport: fallback([
    ...(process.env.ETH_RPC_URL ? [http(process.env.ETH_RPC_URL)] : []),
    http('https://1rpc.io/eth'),
    http('https://eth.drpc.org'),
  ]),
  chain: mainnet,
})
const celoPublicClient = createPublicClient({
  transport: fallback([
    ...(process.env.CELO_RPC_URL ? [http(process.env.CELO_RPC_URL)] : []),
    http('https://forno.celo.org'),
  ]),
  chain: celo,
})
const LOCKED_CELO_CONTRACT_ADDRESS =
  '0x6cC083Aed9e3ebe302A6336dBC7c921C9f03349E'
const WEI = BigInt('1000000000000000000')
const MIN_ETH_ON_MAINNET = (BigInt(1) * WEI) / BigInt(100) // 0.01 ETH
const MIN_LOCKED_CELO = BigInt(100) * WEI // 100 LockedCELO

async function addressCanBeElevatedToTrusted(address: `0x${string}`) {
  const [ethOnMainnet, lockedCELO] = await Promise.all([
    ethPublicClient.getBalance({ address }),
    celoPublicClient.readContract({
      address: LOCKED_CELO_CONTRACT_ADDRESS,
      abi: lockedGoldABI,
      functionName: 'getAccountTotalLockedGold',
      args: [address],
    }),
  ])

  return ethOnMainnet >= MIN_ETH_ON_MAINNET || lockedCELO >= MIN_LOCKED_CELO
}

import { lockedGoldABI } from '@celo/abis'
import { Redis } from '@upstash/redis'
import { getApps, initializeApp } from 'firebase-admin/app'
import { getDatabase } from 'firebase-admin/database'
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
import { getFirebaseCredential } from './gcp-credential'

function getDB() {
  if (!getApps().length) {
    initializeApp({
      credential: getFirebaseCredential(),
      databaseURL: `https://${process.env.NEXT_PUBLIC_FIREBASE_PID}.firebaseio.com`,
    })
  }
  return getDatabase()
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

export async function sendRequest(
  address: Address,
  skipStables: boolean,
  network: Network,
  authLevel: AuthLevel,
  ip?: string,
  userId?: string,
): Promise<{ key?: string; reason?: 'rate_limited' }> {
  // NOTE: make sure address is stable (no lowercase/not-prefixed BS)
  const beneficiary = getAddress(
    address.startsWith('0x') ? address : `0x${address}`,
  )

  const newRequest: RequestRecord = {
    beneficiary,
    status: RequestStatus.Pending,
    type: RequestType.Faucet,
    tokens: skipStables ? RequestedTokenSet.Celo : RequestedTokenSet.All,
    authLevel,
  }

  try {
    if (await addressCanBeElevatedToTrusted(beneficiary)) {
      authLevel = AuthLevel.authenticated
    }
    const db = getDB()
    const redis = Redis.fromEnv()
    const namespace = 'rate-limits'
    const ipNamespace = 'ip-counts'

    const [
      pendingRequestCountGlobal,
      pendingRequestCountForBeneficiary,
      pendingRequestCountForUser,
      pendingRequestCountForIp,
    ] = await Promise.all([
      redis.hlen(`${namespace}:global`),
      redis.hlen(`${namespace}:${beneficiary}`),
      userId ? redis.hlen(`${namespace}:${userId}`) : 0,
      redis.hlen(`${ipNamespace}:${ip}`),
    ])

    if (pendingRequestCountGlobal >= GLOBAL_RATE_LIMITS[authLevel].count) {
      return { reason: 'rate_limited' }
    }

    if (pendingRequestCountForIp >= RATE_LIMITS_PER_IP.count) {
      return { reason: 'rate_limited' }
    }

    if (userId && pendingRequestCountForUser >= RATE_LIMITS[authLevel].count) {
      return { reason: 'rate_limited' }
    }

    if (pendingRequestCountForBeneficiary >= RATE_LIMITS[authLevel].count) {
      return { reason: 'rate_limited' }
    }

    const ref = await db.ref(`${network}/requests`).push(newRequest)

    const params = {
      // INCREASE GLOBAL COUNT
      [`${namespace}:global`]:
        GLOBAL_RATE_LIMITS[authLevel].timePeriodInSeconds,

      // INCREASE COUNT FOR BENEFICIARY
      [`${namespace}:${beneficiary}`]:
        RATE_LIMITS[authLevel].timePeriodInSeconds,

      // INCREASE COUNT FOR USER IDENTIFIER IF AUTHENTICATED
      ...(userId != null && {
        [`${namespace}:${userId}`]:
          RATE_LIMITS.authenticated.timePeriodInSeconds,
      }),
      // INCREASE COUNT FOR IP
      [`${ipNamespace}:${ip}`]: RATE_LIMITS_PER_IP.timePeriodInSeconds,
    }

    /// BEGIN TRANSACTION
    const tx = redis.multi()
    for (const [path, ttl] of Object.entries(params)) {
      tx.hsetnx(path, ref.key!, 1)
      tx.expire(path, ttl)
      tx.hexpire(path, ref.key!, ttl)
    }
    await tx.exec()
    /// END TRANSACTION

    return { key: ref.key! }
  } catch (e) {
    console.error(`Error while sendRequest: ${e}`)
    throw e
  }
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

import { lockedGoldABI } from '@celo/abis'
import { Redis } from '@upstash/redis'
import { randomUUID } from 'node:crypto'
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

// Atomic check-and-reserve for the four rate-limit buckets. Running the
// HLEN reads, the limit checks, and the HSETNX/EXPIRE/HEXPIRE writes in a
// single Lua block makes the sequence atomic with respect to other Redis
// clients, closing the TOCTOU window where a concurrent burst could all
// observe the same pre-increment counts and all pass the gate.
//
// KEYS[1] global bucket  ARGV[1] global limit   ARGV[5] global ttl
// KEYS[2] beneficiary    ARGV[4] beneficiary    ARGV[8] beneficiary ttl
// KEYS[3] user (or '')   ARGV[3] user           ARGV[7] user ttl
// KEYS[4] ip             ARGV[2] ip             ARGV[6] ip ttl
// ARGV[9] reservation field (caller-generated uuid)
const ATOMIC_RATE_LIMIT_RESERVE_LUA = `
local globalCount = redis.call('HLEN', KEYS[1])
if globalCount >= tonumber(ARGV[1]) then return 'rate_limited' end

local ipCount = redis.call('HLEN', KEYS[4])
if ipCount >= tonumber(ARGV[2]) then return 'rate_limited' end

if KEYS[3] ~= '' then
  local userCount = redis.call('HLEN', KEYS[3])
  if userCount >= tonumber(ARGV[3]) then return 'rate_limited' end
end

local beneficiaryCount = redis.call('HLEN', KEYS[2])
if beneficiaryCount >= tonumber(ARGV[4]) then return 'rate_limited' end

local field = ARGV[9]

redis.call('HSETNX', KEYS[1], field, 1)
redis.call('EXPIRE', KEYS[1], ARGV[5])
redis.call('HEXPIRE', KEYS[1], ARGV[5], 'FIELDS', 1, field)

redis.call('HSETNX', KEYS[2], field, 1)
redis.call('EXPIRE', KEYS[2], ARGV[8])
redis.call('HEXPIRE', KEYS[2], ARGV[8], 'FIELDS', 1, field)

if KEYS[3] ~= '' then
  redis.call('HSETNX', KEYS[3], field, 1)
  redis.call('EXPIRE', KEYS[3], ARGV[7])
  redis.call('HEXPIRE', KEYS[3], ARGV[7], 'FIELDS', 1, field)
end

redis.call('HSETNX', KEYS[4], field, 1)
redis.call('EXPIRE', KEYS[4], ARGV[6])
redis.call('HEXPIRE', KEYS[4], ARGV[6], 'FIELDS', 1, field)

return 'ok'
`

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
    const db = await getDB()
    const redis = Redis.fromEnv()
    const namespace = 'rate-limits'
    const ipNamespace = 'ip-counts'

    const globalKey = `${namespace}:global`
    const beneficiaryKey = `${namespace}:${beneficiary}`
    const userKey = userId ? `${namespace}:${userId}` : ''
    const ipKey = `${ipNamespace}:${ip}`

    // Generate the reservation field up front so the Redis reservation and
    // the Firebase entry share the same id. This lets the Lua reservation
    // run before the Firebase push instead of after — which is what closes
    // the original TOCTOU window.
    const reservationKey = randomUUID()

    const reserveResult = (await redis.eval(
      ATOMIC_RATE_LIMIT_RESERVE_LUA,
      [globalKey, beneficiaryKey, userKey, ipKey],
      [
        GLOBAL_RATE_LIMITS[authLevel].count,
        RATE_LIMITS_PER_IP.count,
        RATE_LIMITS[authLevel].count,
        RATE_LIMITS[authLevel].count,
        GLOBAL_RATE_LIMITS[authLevel].timePeriodInSeconds,
        RATE_LIMITS_PER_IP.timePeriodInSeconds,
        RATE_LIMITS.authenticated.timePeriodInSeconds,
        RATE_LIMITS[authLevel].timePeriodInSeconds,
        reservationKey,
      ],
    )) as string

    if (reserveResult === 'rate_limited') {
      return { reason: 'rate_limited' }
    }

    // Slot is reserved in Redis. Write to Firebase under the same key.
    // If the Firebase write fails, roll back the Redis reservation so the
    // slot isn't permanently consumed by a never-processed request.
    try {
      await db.ref(`${network}/requests/${reservationKey}`).set(newRequest)
    } catch (e) {
      try {
        const rollback = redis.multi()
        rollback.hdel(globalKey, reservationKey)
        rollback.hdel(beneficiaryKey, reservationKey)
        if (userKey) rollback.hdel(userKey, reservationKey)
        rollback.hdel(ipKey, reservationKey)
        await rollback.exec()
      } catch (rollbackErr) {
        console.error(
          `Rollback failed for reservation ${reservationKey}: ${rollbackErr}`,
        )
      }
      throw e
    }

    return { key: reservationKey }
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

import { lockedGoldABI } from '@celo/abis'
import { Redis } from '@upstash/redis'
import {
  Address,
  createPublicClient,
  createWalletClient,
  extractChain,
  Hex,
  http,
  parseEther,
  SignTypedDataParameters,
  verifyTypedData,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { celo, celoAlfajores, mainnet } from 'viem/chains'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

// only alfajores but all thats needed to support more is for it to be added to the list and then people to request being fauceted from that domain
const FAUCET_CHAINS = [celoAlfajores] as const
const FAUCET_CHAIN_IDS = FAUCET_CHAINS.map(({ id }) => id)
const determineChain = (domain: ReturnType<typeof EIP712Domain>) =>
  extractChain({ chains: FAUCET_CHAINS, id: domain.chainId })

async function hasBeenUsed(hash: string) {
  console.time('hasBeenUsed')
  const hashkey = `sig:${hash}`
  // Key Doesn't Exist: returns 1, Key Already Exists: returns 0
  // exists means it has been used
  const result = await redis.setnx(hashkey, true)
  console.timeEnd('hasBeenUsed')
  if (result === 0) {
    return true
  }
  return false
}

const PERIOD_SECONDS = 60 * 30

async function getFaucetsForAccount(address: Address) {
  console.time('getFaucetsForAccount')
  const key = `addr:${address}`
  const pipeline = redis.pipeline()
  pipeline.incr(key)
  pipeline.expire(key, PERIOD_SECONDS)
  const result = await pipeline.exec<[number]>()
  console.timeEnd('getFaucetsForAccount')
  return result[0]
}

export const FaucetRequest712Type: Pick<
  SignTypedDataParameters,
  'primaryType' | 'types'
> = {
  types: {
    FaucetRequest: [
      { name: 'beneficiary', type: 'address' },
      {
        name: 'verification',
        type: 'string',
      },
      {
        name: 'blockHash',
        type: 'string',
      },
    ],
    Strategy: [
      {
        name: 'name',
        type: 'string',
      },
    ],
  },
  primaryType: 'FaucetRequest',
} as const

export const EIP712Domain = (chainID: (typeof FAUCET_CHAIN_IDS)[number]) =>
  ({
    name: 'CeloFaucet',
    version: '1',
    chainId: chainID,
  }) satisfies SignTypedDataParameters['domain']

// check there is balance in the account or look at talet protocol, socialconnect/minipay, self, or we can even do a whitelist of accounts
type SybilStrategy = 'lockcelo' | 'eth' | 'none' // | 'talent' | 'self-connect' | 'self-id' | 'privledged

export interface FaucetRequest {
  signer: Address
  signature: Hex
  domain: ReturnType<typeof EIP712Domain>
  message: {
    beneficiary: Address
    verification: SybilStrategy
    blockHash: Hex
  }
}

const MAX_FAUCETS_PER_PERIOD_PER_ACCOUNT = 30
const MAX_DRIFT = 30 // make sure that the request was signed with in X blocks. keep things fresh!

export async function verifyRequest(request: FaucetRequest) {
  const chain = determineChain(request.domain)

  const publicClient = createPublicClient({
    chain,
    transport: http(),
  })
  console.time('verifyTypedData')
  const isAuthentic = await verifyTypedData({
    ...FaucetRequest712Type,
    address: request.signer,
    signature: request.signature,
    domain: request.domain,
    message: request.message,
  })
  console.timeEnd('verifyTypedData')

  ensure(isAuthentic, 'Signature is not authentic')

  const [
    latestBlockNumber,
    lastKnownBlockAtTimeOfSigning,
    alreadyUsed,
    requestCountForAccount,
  ] = await Promise.all([
    publicClient.getBlockNumber(),
    publicClient.getBlock({ blockHash: request.message.blockHash }),
    hasBeenUsed(request.signature),
    getFaucetsForAccount(request.signer),
  ])

  console.info(
    'drift',
    latestBlockNumber - lastKnownBlockAtTimeOfSigning.number,
  )
  ensure(
    latestBlockNumber - lastKnownBlockAtTimeOfSigning.number < MAX_DRIFT,
    'Request is too old, please try again',
  )
  ensure(
    requestCountForAccount <= MAX_FAUCETS_PER_PERIOD_PER_ACCOUNT,
    'You have reached the maximum number of requests for this account in this period',
  )
  ensure(!alreadyUsed, 'This request has already been used')

  return true
}

async function getValueByStrategy({
  signer,
  message,
}: Pick<FaucetRequest, 'message' | 'signer'>) {
  switch (message.verification) {
    case 'eth':
      return ethStrategy({ address: signer })
    case 'lockcelo':
      return lockeCeloStrategy({ address: signer })
    case 'none':
      return noStrategy({ address: signer })
  }
}

type Strategic = (params: { address: Address }) => Promise<{
  maxValue: bigint
  passed: boolean
}>

const LOCKED_CELO_CONTRACT_ADDRESSS =
  '0x6cc083aed9e3ebe302a6336dbc7c921c9f03349e'

// there will be a global max of 50 per day and no more than 1 per 2 minutes
const noStrategy: Strategic = async function noStrategy({}) {
  const key = `nostrategy:${new Date().toISOString().slice(0, 10)}` // YYYY-MM-DD
  const count = await redis.incr(key)

  if (count === 1) {
    await redis.expire(key, 60 * 60 * 24) // 24 hours expiry
  }

  // Enforce max 50 per day
  if (count > 50) {
    return {
      passed: false,
      maxValue: parseEther('0'),
    }
  }

  // Enforce no more than 1 per 2 minutes globally
  const cooldownKey = `nostrategy:cooldown`
  const lastCalled = await redis.get<number>(cooldownKey)
  const now = Date.now()

  let passed = false
  if (!lastCalled || now - lastCalled >= 120_000) {
    passed = true
    await redis.set(cooldownKey, now, { ex: 60 * 60 * 12 }) // 12 hours expiry
  }

  return {
    passed,
    // TODO make this dynamic based on the baseFeePerGas for block  * X
    maxValue: parseEther('0.03'),
  }
}

const lockeCeloStrategy: Strategic = async function lockeCeloStrategy({
  address,
}) {
  const client = createPublicClient({
    chain: celo,
    transport: http(),
  })

  const lockedCelo = await client.readContract({
    address: LOCKED_CELO_CONTRACT_ADDRESSS,
    abi: lockedGoldABI,
    functionName: 'getAccountTotalLockedGold',
    args: [address],
  })

  return {
    maxValue: lockedCelo / BigInt('100'),
    passed: lockedCelo > parseEther('20'),
  }
}

function ensure(predicate: boolean, message: string): void {
  if (!predicate) {
    throw new Error(message)
  }
}

const MAX_CELO_FOR_ETH = parseEther('10')

const ethStrategy: Strategic = async function ethStrategy({ address }) {
  const client = createPublicClient({
    chain: mainnet,
    transport: http(),
  })

  const balance = await client.getBalance({ address })

  return {
    maxValue: balance > MAX_CELO_FOR_ETH ? MAX_CELO_FOR_ETH : balance,
    passed: balance > parseEther('0.0001'),
  }
}

export async function processFaucet(request: FaucetRequest) {
  console.time('verifyRequest')
  const isValid = await verifyRequest(request)
  console.timeEnd('verifyRequest')
  if (!isValid) {
    return false
  }
  console.time('getValueByStrategy')
  const { maxValue, passed } = await getValueByStrategy({
    signer: request.signer,
    message: request.message,
  })
  console.timeEnd('getValueByStrategy')

  ensure(
    passed,
    `${request.signer} failed to pass the #${request.message.verification} strategy check`,
  )

  const chain = determineChain(request.domain)

  const walletClient = createWalletClient({
    chain,
    transport: http(),
    account: privateKeyToAccount(process.env.PRIVATE_KEY as Hex),
  })

  console.time('sendTransaction')
  const hash = await walletClient.sendTransaction({
    to: request.message.beneficiary,
    chain,
    value: maxValue,
  })
  console.timeEnd('sendTransaction')

  return hash
}

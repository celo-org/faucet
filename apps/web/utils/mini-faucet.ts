import { Redis } from '@upstash/redis'
import {
  Address,
  createWalletClient,
  extractChain,
  Hex,
  http,
  parseEther,
  SignTypedDataParameters,
  verifyTypedData
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { celoAlfajores } from 'viem/chains'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

// only alfajores but all thats needed to support more is for it to be added to the list and then people to request being fauceted from that domain
const FAUCET_CHAINS = [celoAlfajores] as const
const FAUCET_CHAIN_IDS = FAUCET_CHAINS.map(({ id }) => id)
const determineChain = (chainId: | typeof celoAlfajores.id) =>
  extractChain({ chains: FAUCET_CHAINS, id: chainId })

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

export const EIP712Domain = (chainID: number) =>
  ({
    name: 'CeloFaucet',
    version: '1',
    chainId: chainID,
  }) satisfies SignTypedDataParameters['domain']

// check there is balance in the account or look at talet protocol, socialconnect/minipay, self, or we can even do a whitelist of accounts
type SybilStrategy = 'lockcelo' | 'eth' | 'none' | 'farcaster' 

export interface FaucetRequest {
  signer: Address
  signature: Hex
  domain: ReturnType<typeof EIP712Domain>
  message: {
    beneficiary: Address
    verification: SybilStrategy
    chainId: typeof celoAlfajores.id
  }
}

const MAX_FAUCETS_PER_PERIOD_PER_ACCOUNT = 30

export async function verifyRequest(request: FaucetRequest) {

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
    alreadyUsed,
    requestCountForAccount,
  ] = await Promise.all([
    hasBeenUsed(request.signature),
    getFaucetsForAccount(request.signer),
  ])
 
  ensure(
    requestCountForAccount <= MAX_FAUCETS_PER_PERIOD_PER_ACCOUNT,
    'You have reached the maximum number of requests for this account in this period',
  )
  ensure(!alreadyUsed, 'This request has already been used')

  return true
}


type Strategic = (params: { address: Address }) => Promise<{
  maxValue: bigint
  passed: boolean
}>

function ensure(predicate: boolean, message: string): void {
  if (!predicate) {
    throw new Error(message)
  }
}



export async function processFaucet(request: FaucetRequest) {
  console.time('verifyRequest')
  const isValid = await verifyRequest(request)
  console.timeEnd('verifyRequest')
  if (!isValid) {
    return false
  }

  const maxValue = parseEther('0.5') // default max value

  const chain = determineChain(request.message.chainId)

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

export type FaucetResponce =
  | {
      hash: Hex
      ok: true
    }
  | {
      message: string
      ok: false
    }
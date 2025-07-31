
import { lockedGoldABI } from '@celo/abis';
import { AuthLevel } from 'types';
import { bigIntMax, bigIntMin } from 'utils/big-min-max';
import { Address, createPublicClient, http, parseEther } from 'viem';
import { celo, mainnet } from 'viem/chains';

const UNQUALIFIED_VALUE = parseEther("0.01")

// never allow more than 100 CELO to be fauceted (would require either 10 ETH or 1000 CELO locked)
const GLOBAL_MAX_QUALIFIED_VALUE = parseEther('100')

export async function getQualifiedValue(address: Address, authLevel: AuthLevel): Promise<bigint> {
  try {
  const qualified = await Promise.all([
    getDefaultQualifiedValue(),
    getLockedCeloQualifiedValue(address),
    getEthQualifiedValue(address)
  ])
  const best = bigIntMax(...qualified)
  const boosted = authLevel === 'authenticated' ? best * BigInt(10) : best
  return bigIntMin(boosted, GLOBAL_MAX_QUALIFIED_VALUE)
  } catch (error) {
    console.error('Error getting qualified value:', error)
    return UNQUALIFIED_VALUE; // Fallback to default value in case of error
  }
}

async function getDefaultQualifiedValue(): Promise<bigint> {
  return UNQUALIFIED_VALUE 
}

async function getLockedCeloQualifiedValue(address: Address): Promise<bigint> {
  console.time('getLockedCeloQualifiedValue')
  const LOCKED_CELO_CONTRACT_ADDRESSS =
  '0x6cc083aed9e3ebe302a6336dbc7c921c9f03349e'
  const client = createPublicClient({
    chain: celo,
    transport: http()
  });
  const lockedCelo = await client.readContract({
    address: LOCKED_CELO_CONTRACT_ADDRESSS,
    abi: lockedGoldABI,
    functionName: 'getAccountTotalLockedGold',
    args: [address],
  })
  console.timeEnd('getLockedCeloQualifiedValue')
  // Placeholder for logic to determine the locked CELO value based on address and chainId
  // This could involve checking balances, user status, etc.
  return lockedCelo > BigInt(1) ? lockedCelo / BigInt(10) : BigInt(0);
}

async function getEthQualifiedValue(address: Address): Promise<bigint> {
  console.time('getEthQualifiedValue')
  const client = createPublicClient({
    chain: mainnet,
    transport: http(),
  })

  const balance = await client.getBalance({ address })
  console.timeEnd('getEthQualifiedValue')
  return balance * BigInt(10)
}
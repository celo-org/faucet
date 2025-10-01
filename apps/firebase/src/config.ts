import type { ReferenceOptions } from 'firebase-functions/database'
import type { PoolOptions } from './database-helper'

export interface NetworkConfig {
  nodeUrl: string
  faucetGoldAmount: bigint
  authenticatedGoldAmount: bigint
}

const ALFAJORES_CONFIG: NetworkConfig = {
  nodeUrl: 'https://alfajores-forno.celo-testnet.org',
  faucetGoldAmount: 300_000_000_000_000_000n,
  authenticatedGoldAmount: 3_000_000_000_000_000_000n,
}

const CELO_SEPOLIA_CONFIG: NetworkConfig = {
  nodeUrl: 'https://forno.celo-sepolia.celo-testnet.org',
  faucetGoldAmount: 300_000_000_000_000_000n,
  authenticatedGoldAmount: 3_000_000_000_000_000_000n,
}

const CONFIGS: Record<string, NetworkConfig> = {
  alfajores: ALFAJORES_CONFIG,
  'celo-sepolia': CELO_SEPOLIA_CONFIG,
}

export function getNetworkConfig(net: string): NetworkConfig {
  if (CONFIGS[net] == null) {
    throw new Error('No Config for: ' + net)
  }

  return CONFIGS[net]
}

export const PROCESSOR_RUNTIME_OPTS: ReferenceOptions = {
  // When changing this, check that `DB_POOL_OPTS.actionTimeoutMS` is less than this number
  timeoutSeconds: 120,
  memory: '512MiB',
  ref: '/{network}/requests/{request}',
}

export const DB_POOL_OPTS: PoolOptions = {
  retryWaitMS: 1_000,
  getAccountTimeoutMS: 20_000,
  actionTimeoutMS: 90_000,
}

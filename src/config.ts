import * as functions from 'firebase-functions'

export interface NetworkConfig {
  nodeUrl: string
  faucetGoldAmount: string
  faucetStableAmount: string
  bigFaucetSafeAddress: string
  bigFaucetSafeAmount: string
  bigFaucetSafeStablesAmount: string
}



export function getNetworkConfig(net: string): NetworkConfig {
  const allconfig = functions.config()
  const config = allconfig.faucet

  if (config[net] == null) {
    throw new Error('No Config for: ' + net)
  }

  return {
    nodeUrl: config[net].node_url,
    faucetGoldAmount: config[net].faucet_gold_amount,
    faucetStableAmount: config[net].faucet_stable_amount,
    bigFaucetSafeAddress: config[net].big_faucet_safe_address,
    bigFaucetSafeAmount: config[net].big_faucet_safe_amount,
    bigFaucetSafeStablesAmount: config[net].big_faucet_safe_stables_amount,
  }
}

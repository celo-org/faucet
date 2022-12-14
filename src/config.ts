import * as functions from 'firebase-functions'

export interface NetworkConfig {
  nodeUrl: string
  faucetGoldAmount: string
  faucetStableAmount: string
  expirySeconds: number
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
    expirySeconds: Number(config[net].expiry_seconds),
  }
}

import { Network, FaucetAddress } from 'src/faucet-interfaces'
const MINIMUM_BALANCE = BigInt('5100000000000000000') // IN WEI

function getApiPath(network: Network) {
  const faucetAddress = FaucetAddress[network]
  const root = `https://explorer.celo.org/${network}/api`
  const apiPath = `${root}?module=account&action=balance&address=${faucetAddress}`
  return apiPath
}

async function getFaucetBalance(network: Network) {
  const apiPath = getApiPath(network)
  const result = await fetch(apiPath)

  const data: { result: string | null } = await result.json()

  return data.result
}

// returns true if faucet has less than 5 CELO
export async function isBalanceBelowPar(network: Network) {
  const balance = await getFaucetBalance(network)
  if (balance === null) {
    // if for some reason the Celo Explore returns an error, just let faucet work as if it had balance
    return false
  }
  const balanceInt = BigInt(balance)

  return balanceInt <= MINIMUM_BALANCE
}

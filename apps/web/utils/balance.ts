import { FAUCET_POOL_ADDRESSES, Network } from 'types'

const MINIMUM_BALANCE = BigInt('5100000000000000000') // IN WEI

/**
 * Blockscout host for a network.
 *
 * This used to interpolate as `celo-${network}`, which for `celo-sepolia`
 * produced `celo-celo-sepolia.blockscout.com` — a host that 404s. Every lookup
 * threw, the catch below swallowed it, and the "out of CELO" banner could
 * never appear no matter how empty the pool was.
 */
function getApiPath(network: Network, address: string) {
  const root = `https://${network}.blockscout.com/api`
  return `${root}?module=account&action=balance&address=${address}`
}

async function getBalance(
  network: Network,
  address: string,
): Promise<bigint | null> {
  const result = await fetch(getApiPath(network, address))
  const data: { result: string | null } = await result.json()
  return data.result === null ? null : BigInt(data.result)
}

/**
 * True when the accounts that actually pay out are running dry.
 *
 * Sums the pool rather than reading a single address: payouts are dispatched
 * from whichever account the pool locks, so one account's balance says nothing
 * about whether the faucet can serve the next request.
 */
export async function isBalanceBelowPar(network: Network) {
  try {
    const balances = await Promise.all(
      FAUCET_POOL_ADDRESSES[network].map((address) =>
        getBalance(network, address),
      ),
    )

    // A Blockscout error must not be read as an empty faucet — treat unknown
    // as funded, as the previous implementation did deliberately.
    if (balances.some((balance) => balance === null)) {
      return false
    }

    const total = (balances as bigint[]).reduce(
      (sum, balance) => sum + balance,
      BigInt(0),
    )
    return total <= MINIMUM_BALANCE
  } catch (error) {
    console.error('Could not read the faucet pool balance', error)
  }
  return false
}

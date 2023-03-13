const FAUCET_ADDRESS = '0x22579CA45eE22E2E16dDF72D955D6cf4c767B0eF'
const ROOT_URL = "https://explorer.celo.org/alfajores/api"
const API_PATH = `${ROOT_URL}?module=account&action=balance&address=${FAUCET_ADDRESS}`
const MINIMUM_BALANCE = BigInt("510000000000000000") // IN WEI

async function getFaucetBalance() {
  const result = await fetch(API_PATH)

  const data: {result: string | null} = await result.json()

  return data.result
}

// returns true if faucet has less than 5 CELO
export async function isBalanceBelowPar() {
  const balance = await getFaucetBalance()
  if (balance === null) {
    // if for some reason the Celo Explore returns an error, just let faucet work as if it had balance
    return true
  }
  const balanceInt = BigInt(balance)
  return balanceInt <= MINIMUM_BALANCE
}
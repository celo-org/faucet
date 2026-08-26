import { createPublicClient, formatEther, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { celoSepolia } from 'viem/chains'
import { describe, expect, it } from 'vitest'
import { CeloAdapter } from './celo-adapter'

// Real on-chain exercise of the payout path.
//
// Every other test mocks `transferCelo`, so nothing otherwise proves that the
// hash `dispatchCeloFunds` writes to `goldTxHash` is a real, resolvable
// transaction. Opt-in because it spends gas:
//
// RUN_ONCHAIN_TESTS=1 PRIVATE_KEY=... yarn --cwd apps/firebase test:ci onchain
//
// The transfer is a self-send, so only gas is consumed.
const NODE_URL = 'https://forno.celo-sepolia.celo-testnet.org'
const enabled = Boolean(
  process.env.RUN_ONCHAIN_TESTS && process.env.PRIVATE_KEY,
)

describe.skipIf(!enabled)('CeloAdapter on-chain (Celo Sepolia)', () => {
  // Everything derived from PRIVATE_KEY has to stay inside the test body.
  // describe.skipIf only skips *running* the tests; the callback still
  // executes at collection, so deriving an account out here crashes the whole
  // file when the variable is absent, as it is in CI.
  function signer() {
    const raw = process.env.PRIVATE_KEY as string
    const pk = (raw.startsWith('0x') ? raw : `0x${raw}`) as `0x${string}`
    return { pk, account: privateKeyToAccount(pk) }
  }

  it('sends CELO and returns a hash that confirms on chain', async () => {
    const { pk, account } = signer()
    const publicClient = createPublicClient({
      chain: celoSepolia,
      transport: http(NODE_URL),
    })
    const adapter = new CeloAdapter({ pk, nodeUrl: NODE_URL })
    // The unauthenticated drip amount, sent to itself so only gas is spent.
    const amount = 300_000_000_000_000_000n

    const txHash = await adapter.transferCelo(account.address, amount)
    expect(txHash).toMatch(/^0x[0-9a-f]{64}$/)

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      timeout: 120_000,
    })
    const fee = receipt.gasUsed * receipt.effectiveGasPrice

    // Read at explicit blocks, not `latest`: Forno is load balanced, and right
    // after a receipt lands a replica may still serve the pre-transaction
    // state (making a latest-vs-latest diff read as zero) or reject the block
    // outright as out of range. Both need a retry.
    const balanceAt = async (blockNumber: bigint) => {
      let lastError: unknown
      for (let i = 0; i < 15; i++) {
        try {
          return await publicClient.getBalance({
            address: account.address,
            blockNumber,
          })
        } catch (e) {
          lastError = e
          await new Promise((resolve) => setTimeout(resolve, 2000))
        }
      }
      throw lastError
    }

    const before = await balanceAt(receipt.blockNumber - 1n)
    const after = await balanceAt(receipt.blockNumber)

    console.info(`    tx        ${txHash}`)
    console.info(`    status    ${receipt.status}`)
    console.info(`    block     ${receipt.blockNumber}`)
    console.info(
      `    gas used  ${receipt.gasUsed} @ ${receipt.effectiveGasPrice} wei`,
    )
    console.info(`    fee       ${formatEther(fee)} CELO`)
    console.info(
      `    delta     ${formatEther(before - after)} CELO (self-send)`,
    )
    console.info(
      `    explorer  https://celo-sepolia.blockscout.com/tx/${txHash}`,
    )

    expect(receipt.status).toBe('success')
    expect(receipt.transactionHash).toBe(txHash)
    // A self-send moves no principal, so the balance falls by exactly the fee.
    expect(before - after).toBe(fee)
  }, 180_000)
})

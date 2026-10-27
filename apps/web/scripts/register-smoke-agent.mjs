/**
 * Register a throwaway ERC-8004 agent so the agent key path can be smoke
 * tested with a real signature.
 *
 * The faucet asks the wallet stored under `getAgentWallet(agentId)` to sign a
 * challenge, so the only way to exercise the successful mint end to end is to
 * hold the key of a registered agent. Nobody here controls one, so this mints
 * one. Every `register()` overload in the registry sets the agent wallet to
 * `msg.sender`, which means one transaction from a wallet you already hold is
 * enough — no `setAgentWallet` step.
 *
 * Mainnet, deliberately: the faucet only trusts the mainnet registry (see
 * utils/agent-identity.ts). Gas is a fraction of a cent of CELO.
 *
 * Usage:
 *   yarn --cwd apps/web register:smoke-agent --dry-run   # address + balance only
 *   yarn --cwd apps/web register:smoke-agent             # sends one transaction
 *
 * The signing key is read from the environment, first match wins:
 *   AGENT_SIGNING_KEY, PRIVATE_KEY_2, PRIVATE_KEY
 * Only the derived address is ever printed.
 */

import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  fallback,
  formatEther,
  http,
  parseAbi,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { celo } from 'viem/chains'

export const IDENTITY_REGISTRY_ADDRESS =
  '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432'

const KEY_ENV_NAMES = ['AGENT_SIGNING_KEY', 'PRIVATE_KEY_2', 'PRIVATE_KEY']

const abi = parseAbi([
  'function register() returns (uint256 agentId)',
  'function getAgentWallet(uint256 agentId) view returns (address)',
  'event Registered(uint256 indexed agentId, string agentURI, address indexed owner)',
])

/** Shared with smoke-agent-key.mjs so neither script needs a key on argv. */
export function loadSigningKey() {
  for (const name of KEY_ENV_NAMES) {
    const raw = process.env[name]
    if (raw) {
      const key = raw.startsWith('0x') ? raw : `0x${raw}`
      return { name, account: privateKeyToAccount(key) }
    }
  }
  console.error(
    `No signing key found. Set one of: ${KEY_ENV_NAMES.join(', ')} (the agent wallet's private key).`,
  )
  process.exit(1)
}

const transport = fallback([
  ...(process.env.CELO_RPC_URL ? [http(process.env.CELO_RPC_URL)] : []),
  http('https://forno.celo.org'),
])

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const { name, account } = loadSigningKey()
  const publicClient = createPublicClient({ chain: celo, transport })

  const balance = await publicClient.getBalance({ address: account.address })
  console.info(
    `Signer ${account.address} (from ${name})\n  Celo mainnet balance: ${formatEther(balance)} CELO`,
  )

  if (balance === 0n) {
    console.error(
      '\nThis wallet has no mainnet CELO, so it cannot pay for register(). Send it a few cents of CELO and retry.',
    )
    process.exit(1)
  }

  if (dryRun) {
    console.info('\n--dry-run: nothing sent.')
    return
  }

  const walletClient = createWalletClient({ account, chain: celo, transport })
  const hash = await walletClient.writeContract({
    address: IDENTITY_REGISTRY_ADDRESS,
    abi,
    functionName: 'register',
    args: [],
  })
  console.info(`\nregister() sent: https://celoscan.io/tx/${hash}`)

  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') {
    console.error('Transaction reverted.')
    process.exit(1)
  }

  let agentId
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== IDENTITY_REGISTRY_ADDRESS.toLowerCase()) {
      continue
    }
    try {
      const decoded = decodeEventLog({
        abi,
        data: log.data,
        topics: log.topics,
      })
      if (decoded.eventName === 'Registered') {
        agentId = decoded.args.agentId
        break
      }
    } catch {
      // A log for some other event; keep looking.
    }
  }
  if (agentId === undefined) {
    console.error('Could not find a Registered event in the receipt.')
    process.exit(1)
  }

  // Public RPC is load balanced and a node can lag the receipt by a block or
  // two, which reads as "no wallet". Retry briefly before calling it a mismatch.
  let wallet
  let matches = false
  for (let attempt = 0; attempt < 10 && !matches; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 2000))
    wallet = await publicClient.readContract({
      address: IDENTITY_REGISTRY_ADDRESS,
      abi,
      functionName: 'getAgentWallet',
      args: [agentId],
    })
    matches = wallet.toLowerCase() === account.address.toLowerCase()
  }
  console.info(
    `\nAgent ${agentId} registered.\n  getAgentWallet(${agentId}) = ${wallet} ${matches ? '(matches signer)' : '(DOES NOT MATCH SIGNER)'}`,
  )
  if (!matches) process.exit(1)

  console.info(`
Next, with the same key in the environment:

  yarn --cwd apps/web smoke:agent-key \\
    --url <deployment> --agent-id ${agentId} --beneficiary ${account.address}
`)
}

// Only run when executed directly, so smoke-agent-key.mjs can import
// loadSigningKey without triggering a registration.
if (process.argv[1] && process.argv[1].endsWith('register-smoke-agent.mjs')) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}

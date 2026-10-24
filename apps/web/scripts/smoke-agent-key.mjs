/**
 * End-to-end smoke test for the agent key path.
 *
 * This is the script that decides whether "your agent gets its own key" is a
 * true sentence. It never sends a cookie, never opens a browser and never
 * touches GitHub: a signing key for the wallet registered against an ERC-8004
 * agent is the only credential involved. If it passes, an agent can do this
 * unattended. If it does not, the claim is not ours to make.
 *
 * Usage:
 *   export AGENT_SIGNING_KEY=0x...        # the agent wallet's private key
 *   yarn --cwd apps/web smoke:agent-key \
 *     --url https://<deployment> --agent-id 2 --beneficiary 0xYourAddress
 *
 * Exits non-zero if any check fails. No secret is ever printed.
 */

import { privateKeyToAccount } from 'viem/accounts'

const USAGE = `Usage:
  export AGENT_SIGNING_KEY=0x...
  yarn --cwd apps/web smoke:agent-key --url <deployment> --agent-id <id> --beneficiary 0x... [--network celo-sepolia]`

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  const value = i === -1 ? fallback : process.argv[i + 1]
  if (!value) {
    console.error(`Missing required --${name}\n\n${USAGE}`)
    process.exit(1)
  }
  return value
}

const BASE = arg('url').replace(/\/$/, '')
const NETWORK = arg('network', 'celo-sepolia')
const AGENT_ID = arg('agent-id')
const BENEFICIARY = arg('beneficiary')
const SIGNING_KEY = process.env.AGENT_SIGNING_KEY

if (!SIGNING_KEY) {
  console.error(
    'Set AGENT_SIGNING_KEY to the private key of the wallet registered for this agent',
  )
  process.exit(1)
}

let failures = 0
function check(label, ok, detail = '') {
  console.info(
    `${ok ? 'PASS' : 'FAIL'}  ${detail ? `${label} — ${detail}` : label}`,
  )
  if (!ok) {
    failures++
  }
}

async function json(path, init) {
  const res = await fetch(`${BASE}${path}`, init)
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

function post(path, body) {
  return json(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // No credentials, deliberately. fetch omits cookies by default, and
    // nothing here ever sets one — that is the property under test.
    body: JSON.stringify(body),
  })
}

async function main() {
  const account = privateKeyToAccount(SIGNING_KEY)
  console.info(
    `Target ${BASE}\n  agent=${AGENT_ID}  wallet=${account.address}  beneficiary=${BENEFICIARY}\n`,
  )

  const unknown = await post('/api/keys/challenge', { agentId: '0xdead' })
  check(
    'malformed agent id rejected with 400',
    unknown.status === 400,
    `got ${unknown.status}`,
  )

  const challenge = await post('/api/keys/challenge', { agentId: AGENT_ID })
  check(
    'challenge issued',
    challenge.status === 200,
    `got ${challenge.status} ${JSON.stringify(challenge.body)}`,
  )
  if (challenge.status !== 200) {
    console.info(`\n${failures} CHECK(S) FAILED`)
    process.exit(1)
  }

  check(
    'challenge names the wallet this agent signs with',
    challenge.body.agentWallet?.toLowerCase() === account.address.toLowerCase(),
    `registry says ${challenge.body.agentWallet}, signing as ${account.address}`,
  )
  check(
    'challenge is bound to this domain and chain',
    challenge.body.message?.includes('faucet.celo.org') &&
      challenge.body.message?.includes('Chain ID: 42220'),
  )

  const signature = await account.signMessage({
    message: challenge.body.message,
  })

  const bad = await post('/api/keys/agent', {
    agentId: AGENT_ID,
    nonce: challenge.body.nonce,
    signature: `0x${'0'.repeat(130)}`,
  })
  check(
    'a signature that does not verify is rejected',
    bad.status === 401,
    `got ${bad.status}`,
  )

  // That failed attempt spent the nonce, which is the intended behaviour, so
  // the real run needs a fresh challenge.
  const fresh = await post('/api/keys/challenge', { agentId: AGENT_ID })
  const freshSignature = await account.signMessage({
    message: fresh.body.message,
  })

  const minted = await post('/api/keys/agent', {
    agentId: AGENT_ID,
    nonce: fresh.body.nonce,
    signature: freshSignature,
  })
  check(
    'key minted with no session, no cookie and no captcha',
    minted.status === 201 && typeof minted.body.key === 'string',
    `got ${minted.status} ${minted.status === 201 ? '' : JSON.stringify(minted.body)}`,
  )

  const replay = await post('/api/keys/agent', {
    agentId: AGENT_ID,
    nonce: fresh.body.nonce,
    signature: freshSignature,
  })
  check(
    'replaying the same challenge is rejected',
    replay.status === 401 && replay.body.error === 'invalid_challenge',
    `got ${replay.status} ${JSON.stringify(replay.body)}`,
  )

  const key = minted.body.key
  if (!key) {
    console.info(`\n${failures} CHECK(S) FAILED`)
    process.exit(1)
  }

  const funded = await json('/api/faucet', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ beneficiary: BENEFICIARY, network: NETWORK }),
  })
  check(
    'the agent-minted key funds an address',
    funded.status === 200,
    `got ${funded.status} ${JSON.stringify(funded.body)}`,
  )

  const requestKey = funded.body?.key
  if (requestKey) {
    let status = ''
    let txHash
    for (let i = 0; i < 30; i++) {
      const res = await json(
        `/api/status?key=${encodeURIComponent(requestKey)}&network=${NETWORK}`,
      )
      status = res.body.status ?? ''
      txHash = res.body.txHash
      if (status === 'Done' || status === 'Failed') break
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
    check('payout reached Done', status === 'Done', `final status ${status}`)
    check(
      'status endpoint returns a tx hash',
      Boolean(txHash),
      txHash ?? 'none',
    )
    if (txHash) {
      console.info(`      https://celo-sepolia.blockscout.com/tx/${txHash}`)
    }
  }

  console.info(
    `\n${failures === 0 ? 'ALL CHECKS PASSED — an agent can do this unattended' : `${failures} CHECK(S) FAILED`}`,
  )
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

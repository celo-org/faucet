/**
 * End-to-end smoke test for the API-key faucet path.
 *
 * Pure HTTP against a running deployment, so it needs no repo credentials and
 * no local build. Mint a key at <url>/keys first, then export it.
 *
 * Usage:
 *   export FAUCET_API_KEY=cfk_...
 *   node apps/web/scripts/smoke-api-key.mjs \
 *     --url https://<deployment> --beneficiary 0xYourAddress
 *
 * Exits non-zero if any check fails. The key is never printed.
 */

const USAGE = `Usage:
  export FAUCET_API_KEY=cfk_...
  node apps/web/scripts/smoke-api-key.mjs --url <deployment> --beneficiary 0x... [--network celo-sepolia]`

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
const BENEFICIARY = arg('beneficiary')
const CREDENTIAL = process.env.FAUCET_API_KEY

if (!CREDENTIAL) {
  console.error('Set FAUCET_API_KEY to a key minted at <url>/keys')
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

async function post(body, credential) {
  const res = await fetch(`${BASE}/api/faucet`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
    },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

const request = { beneficiary: BENEFICIARY, network: NETWORK }

async function main() {
  console.info(
    `Target ${BASE}  network=${NETWORK}  beneficiary=${BENEFICIARY}\n`,
  )

  const unissued = `cfk_prd_deadbeefcafe_${'a'.repeat(43)}`
  check(
    'unissued key rejected with 401',
    (await post(request, unissued)).status === 401,
  )

  const noAuth = await post(request)
  check(
    'no credential is rejected (captcha path)',
    noAuth.status === 401,
    `got ${noAuth.status}`,
  )

  const badAddr = await post({ ...request, beneficiary: 'nope' }, CREDENTIAL)
  check(
    'invalid address rejected with 400',
    badAddr.status === 400,
    `got ${badAddr.status}`,
  )

  const badNet = await post({ ...request, network: 'celo-mainnet' }, CREDENTIAL)
  check(
    'unknown network rejected with 400',
    badNet.status === 400,
    `got ${badNet.status}`,
  )

  const wrongMethod = await fetch(`${BASE}/api/faucet`, { method: 'GET' })
  check(
    'GET rejected with 405',
    wrongMethod.status === 405,
    `got ${wrongMethod.status}`,
  )

  const ok = await post(request, CREDENTIAL)
  check(
    'valid key accepted with 200 and no captcha',
    ok.status === 200,
    `got ${ok.status} ${JSON.stringify(ok.body)}`,
  )

  const requestKey = ok.body?.key
  check('response carries a request key', Boolean(requestKey))

  if (requestKey) {
    let status = ''
    let txHash
    for (let i = 0; i < 30; i++) {
      const res = await fetch(
        `${BASE}/api/status?key=${encodeURIComponent(requestKey)}&network=${NETWORK}`,
      )
      const data = await res.json()
      status = data.status ?? ''
      txHash = data.txHash
      if (status === 'Done' || status === 'Failed') {
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
    check(
      'payout reached Done',
      status === 'Done',
      `final status ${status || 'none'}`,
    )
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
    `\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`,
  )
  console.info('Revoke the key at ' + BASE + '/keys when you are done.')
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

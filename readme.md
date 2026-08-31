# Welcome to Celo Faucet app

This Repo contains the code for the celo testnets faucet. This is contained in 2 apps.

- The firebase app contains functions which do the actual fauceting.

- The web app contains a UI for making requests.

The web app deploys automatically to vercel.

The deploy-chains gh actions deploys functions to staging and production envronments from staging and master branches respectively

Note other branches are not deployed autamtically but can be by manually triggering the flow

## Setup

### Wep app

To set up the web app to run locally:

1.  navigate to the `apps/web` folder

    ```sh
    $ cd apps/web
    ```

1.  link your local repository to the `faucet` project on Vercel

    ```sh
    $ yarn dlx vercel@latest link
    ```

    You'll be asked to authenticate with your Vercel account. Once you've done that, you'll be
    guided through a series of prompts to link your local project to the `faucet` Vercel project.

    ```
    ? Set up “~/Documents/celo-org/faucet/apps/web”? [Y/n] y
    ? Which scope should contain your project? Celo Ecosystem Project Hosting
    ? Link to existing project? [y/N] y
    ? What’s the name of your existing project? faucet
    ✅  Linked to c-labs/faucet (created .vercel)
    ```

1.  fetch environment variables from Vercel

    ```sh
    $ yarn dlx vercel@latest env pull
    ```

    If you get an error like `Error! No project found`, you may need to run `vercel link` again.
    If everything worked, you should see a message like this:

    ```sh
    > Downloading `development` Environment Variables for Project faucet
    ✅  Created .env.local file  [249ms]
    ```

1.  run the app locally

    ```sh
    $ yarn dev
    ```

    You should see a message like this:

    ```sh
    ready - started server on 0.0.0.0:3000, url: http://localhost:3000
    info  - Loaded env from /Users/arthur/Documents/celo-org/faucet/apps/web/.env.local
    ```

    You can now view the app in your browser at http://localhost:3000.

## Firebase app

To set up the firebase app to run locally:

1.  navigate to the `apps/firebase` folder
    ```sh
    $ cd apps/firebase
    ```
1.  login to firebase
    ```sh
    $ yarn dlx firebase-tools@latest login
    ```
    You'll be asked to authenticate with your Firebase account.
1.  build the firebase app
    ```sh
    $ yarn run preserve
    ```
1.  ensure that you are on required node version specified in `engines.node` in
    `firebase/package.json`. Currently this is Node 24 at the time of writing.
    ```sh
    $ nvm use <the-required-node-version>
    ```
1.  run the firebase app locally
    ```sh
    $ yarn run serve
    ```

## Programmatic access (API keys)

The browser flow is gated on reCAPTCHA v3, which scores headless callers badly
and cannot be solved without driving a real browser. Scripts and AI agents use
an API key instead.

### Getting a key

Sign in with GitHub at [`/keys`](https://faucet.celo.org/keys) and create one.
The key is shown once and only a hash of it is stored, so it cannot be
recovered — create a new one if you lose it. You may hold up to 2 keys and they
expire after 90 days.

### Making a request

Send the key as a bearer token and omit `captchaToken`:

```sh
curl -X POST https://faucet.celo.org/api/faucet \
  -H "Authorization: Bearer cfk_prd_…" \
  -H 'Content-Type: application/json' \
  -d '{"beneficiary":"0xYourAddress","network":"celo-sepolia"}'
```

A successful call returns `202`-style bookkeeping: `{"status":"Pending","key":"…"}`.
Poll for the outcome with that key:

```sh
curl "https://faucet.celo.org/api/status?key=<key>&network=celo-sepolia"
# {"status":"Done","beneficiary":"0x…","txHash":"0x…"}
```

Other responses carry a machine-readable `error` code so you can branch without
parsing prose:

| Status | `error`                 | Meaning                                    |
| ------ | ----------------------- | ------------------------------------------ |
| `400`  | —                       | Invalid network or beneficiary address     |
| `401`  | `invalid_api_key`       | Missing, malformed, unknown or expired key |
| `401`  | `api_key_disabled`      | Programmatic access is switched off        |
| `429`  | `faucet_limit_exceeded` | Rate limited; honour `Retry-After`         |
| `405`  | —                       | Wrong HTTP method                          |

The browser flow keeps its existing `403` for rate limits; `429` is used only on
the key path, matching the Coinbase CDP faucet.

### Limits

- Keyed requests count against **your GitHub account's existing daily
  allowance** (10 per 24h), the same bucket the signed-in browser flow uses. A
  key changes how you prove who you are, not how much you can request.
- **Holding two keys does not double your allowance** — the limit is bound to
  the account, not the key, as it is on the Coinbase CDP faucet.
- The per-address limit is shared with the browser path.
- Two ceilings apply across all API keys: a daily one that bounds total spend,
  and a 10-minute burst window that bounds arrival rate. The burst window is
  what stops programmatic traffic locking the payout pool and starving the
  browser flow.
- Testnet only. There is no mainnet exposure.

Never commit a key. Keys found in public repositories are revoked without
notice. If you are integrating a tool that others will install, read the key
from the user's environment — do not ship a default.

### Operating the key path

Environment variables on the web app:

| Variable                          | Required | Purpose                                                                                                                                                |
| --------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `FAUCET_API_KEY_PEPPER`           | yes      | Secret mixed into the HMAC of every stored key. Without it, key minting and verification both fail closed. Rotating it invalidates every existing key. |
| `FAUCET_API_KEY_NETWORKS`         | no       | Comma-separated networks that accept key auth. Defaults to `celo-sepolia`.                                                                             |
| `PROGRAMMATIC_GLOBAL_DAILY_LIMIT` | no       | Daily ceiling across all keys. Defaults to 200.                                                                                                        |
| `PROGRAMMATIC_BURST_LIMIT`        | no       | Keyed requests allowed per 10 minutes across all keys. Bounds arrival rate so the payout pool cannot be locked. Defaults to 20.                        |

To stop all programmatic traffic immediately without a deploy, set the
`api-keys:disabled` key in Upstash to any truthy value. The browser flow is
unaffected. Delete it to re-enable.

### Smoke-testing a deployment

`apps/web/scripts/smoke-api-key.mjs` exercises the whole key path over HTTP —
rejection of unissued keys, address and method validation, a real payout, the
status poll, and the returned tx hash. It needs no repo credentials:

```sh
export FAUCET_API_KEY=cfk_...   # minted at <deployment>/keys
yarn --cwd apps/web smoke:api-key \
  --url https://<deployment> --beneficiary 0xYourAddress
```

It exits non-zero if any check fails and never prints the key.

### Verifying the payout path on chain

Every other test mocks the sender, so nothing otherwise proves the hash written
to `goldTxHash` is a real transaction. `apps/firebase/src/celo-adapter.onchain.test.ts`
sends a real transfer on Celo Sepolia. It is skipped unless explicitly opted in,
because it spends gas:

```sh
RUN_ONCHAIN_TESTS=1 PRIVATE_KEY=<funded key> \
  yarn --cwd apps/firebase test:ci onchain
```

The transfer is a self-send, so only the gas fee (~0.0011 CELO at the 50 gwei
floor) is consumed, and the test asserts the balance falls by exactly that fee.

### Why not a manually issued key?

Keys are self-serve on purpose. Allowlisted keys need a human to triage each
request and hand the secret over out of band, which does not scale and tends to
leave secrets in chat logs. Tying keys to a GitHub account instead reuses an
identity the faucet already understands, which is also what the Coinbase CDP,
Circle, and Chainstack faucets do.

### CI pipelines

If you are testing contracts in CI you probably do not want the faucet at all.
`anvil --fork-url https://forno.celo-sepolia.celo-testnet.org` gives you
pre-funded accounts against forked state, with no rate limits and no network
flakiness. Reach for a key only when you need funds on the real testnet.

## Adding chains

### Web

- Add the chain config and token info to `config/chains.ts`.

- Add chain name to the networks array, and `ChainId` and `FaucetAddress` to enums in `types/index.ts`.

### Firebase

Dispatch the deploy-chains workflow. ensure chain name is kebab case and matches a network in `config/chains.ts`.

# Celo Faucet

A firebase function that creates invites and/or faucets addresses

## Faucet Deployment Configuration

The function requires a few configuration variables to work:

- nodeUrl: The url for the node the faucet server will use to send transactions
- faucetGoldAmount: The amount of gold to faucet on each request
- faucetStableAmount: The amount of each stable token (cUSD, cEUR) to faucet on each request

All these variables, are set using firebase function:config mechanism

Besides these variables, it also need a list of accounts to use for fauceting.
The accounts are stored in firebase realtime DB. For each account it needs:

- account address
- account private key

## Adding additional stable tokens to the faucet

In addition to funding the faucet address with the new token, update the `contractkit` dependency (such that the new desired token is included in the `StableTokenConfig`) and then redeploy this function on firebase.

### Setting Faucet Amounts

Replace net with proper net

```
yarn cli config:set --net alfajores --faucetGoldAmount 1000000000000000000 --faucetStableAmount 1000000000000000000
```

You can verify with `yarn cli config:get --net alfajores`

Alternatively, check which project is currently the default (`firebase projects:list`) and if necessary change this (for example, change to the staging project to test new changes via `firebase use celo-faucet-staging`. Then, use `firebase functions:config:get` and `firebase functions:config:set` to set specific parameters (for example: `firebase functions:config:set faucet.alfajores.faucet_stable_amount="1"` will set the `faucetStableAmount` parameter for the `alfajores` network).

### Setting Node Url

#### Obtain the Node IP

To obtain the node ip use `gcloud compute addresses list`

Take in account that:

- The node name scheme is: `${envname}-tx-nodes-0`
- GCloud Project: celo-testnet-production for Alfajores, celo-testnet for the rest

For Alfajores:

```bash
gcloud compute addresses describe alfajores-tx-nodes-0 \
  --project celo-testnet-production \
  --region us-west1 \
  --format "value(address)"
```

For Integration:

```bash
gcloud compute addresses describe integration-tx-nodes-0 \
  --project celo-testnet \
  --region us-west1 \
  --format "value(address)"
```

#### Set the node URL

In directory: `packages/faucet`, run:

Replace `net` and `ip` with the proper ones

```
yarn cli config:set --net alfajores --nodeUrl http://35.185.236.10:8545
```

You can verify with `yarn cli config:get --net alfajores`

### Setting Accounts

To generate the faucet account addresses and private keys we use celotool in the celo-monorepo.

1.  In Monorepo source the mnemonic `.env` file (i.e. `source .env.mnemonic.alfajores`)
2.  In Monorepo Run `celotooljs generate bip32 -m "$MNEMONIC" -a faucet -i 0` to obtain faucet account `0` private key
3.  In Monorepo Run `celotooljs generate account-address --private-key <<pk_here>>` to obtain the address
4.  In Faucet Run `yarn cli accounts:add --net alfajores <<pk_here>> <<address_here>>` to add the account to the faucet server

Repeat the operation for all the faucet accounts you need (change index `-i` to `1,2,...`)

You can check the result running:

```bash
yarn cli accounts:get --net alfajores
```

### Funding the accounts

Faucet accounts should already be funded on network deploy.

For now, that's not running, so we need to do that manually. The process consists on transfering
funds from validatos-0 account to the faucet account.

To do this, we use `celotool account faucet` command.

Since the command faucet a fixed amount, open `celo-monorepo/packages/celotool/src/cmds/account/faucet.ts` and modify (ex: `--tokenParams CELO,3 cUSD,10 cEUR,5`) with the desired amounts:

```ts
const cb = async () => {
  await execCmd(
    // TODO(yerdua): reimplement the protocol transfer script here, using
    //  the SDK + Web3 when the SDK can be built for multiple environments
    `yarn --cwd ../protocol run transfer -n ${argv.celoEnv} -a ${argv.account} -d 10000 -g 10000`
  )
}
```

And then run:

```bash
celotooljs account faucet -e alfajores --account 0xCEa3eF8e187490A9d85A1849D98412E5D27D1Bb3
```

### How to deploy to staging

1.  `yarn firebase login`
2.  `yarn deploy:staging`
3.  Deployment can be seen at [https://console.firebase.google.com/project/celo-faucet-staging/overview](https://console.firebase.google.com/project/celo-faucet-staging/overview)
4.  You can simulate the access at [https://console.firebase.google.com/project/celo-faucet-staging/database/celo-faucet-staging/rules](https://console.firebase.google.com/project/celo-faucet-staging/database/celo-faucet-staging/rules)

Go to [https://dev.celo.org/developers/faucet](https://dev.celo.org/developers/faucet) and perform submit, verify that no failure appears in the [logs](https://console.firebase.google.com/project/celo-faucet-staging/functions/logs?search=&severity=DEBUG).


## ✍️ <a id="contributing"></a>Contributing

Feel free to jump on the Celo 🚂🚋🚋🚋. Improvements and contributions are highly encouraged! 🙏👊

See the [contributing guide](https://docs.celo.org/what-is-celo/joining-celo/contributors/overview) for details on how to participate.
[![GitHub issues by-label](https://img.shields.io/github/issues/celo-org/celo-monorepo/1%20hour%20tasks)](https://github.com/celo-org/celo-monorepo/issues?q=is%3Aopen+is%3Aissue+label%3A%221+hour+tasks%22)

All communication and contributions to the Celo project are subject to the [Celo Code of Conduct](https://celo.org/code-of-conduct).


## 📜 <a id="license"></a>License

All packages are licensed under the terms of the [Apache 2.0 License](LICENSE) unless otherwise specified in the LICENSE file at package's root.

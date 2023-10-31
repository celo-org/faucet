# Welcome to Alfajores Faucet app

This Repo contains the code for the alfajores faucet. This is contained in 2 apps.

- The firebase app contains functions which do the actual fauceting.

- The web app contains a UI for making requests.

The web app deploys automatically to vercel.

To setup the web app to run locally set the vercel project to clabs/faucet and the env variables from vercel with `vercel env pull` then run `yarn dev`

## Adding chains

### Web

- Add the chain config and token info to `config/chains.ts`.

- Add chain name to the networks array, and `ChainId` and `FaucetAddress` to enums in `types/index.ts`.

### Firebase

In the `apps/firebase` project run `yarn cli config:set` with the relevant params.

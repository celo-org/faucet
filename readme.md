# Welcome to Celo Faucet app

This Repo contains the code for the Celo testnets faucet. This is contained in 2 apps.

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
    `firebase/package.json`. Currently this is Node 20 at the time of writing.
    ```sh
    $ nvm use <the-required-node-version>
    ```
1.  run the firebase app locally
    ```sh
    $ yarn run serve
    ```

## Adding chains

### Web

- Add the chain config and token info to `config/chains.ts`.

- Add chain name to the networks array, and `ChainId` and `FaucetAddress` to enums in `types/index.ts`.

### Firebase

Dispatch the deploy-chains workflow. ensure chain name is kebab case and matches a network in `config/chains.ts`.

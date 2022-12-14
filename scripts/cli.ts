import { execSync } from 'child_process'
import yargs from 'yargs'
import { NetworkConfig } from '../src/config'

// tslint:disable-next-line: no-unused-expression
yargs
  .scriptName('yarn cli')
  .recommendCommands()
  .demandCommand(1)
  .strict(true)
  .showHelpOnFail(true)
  .command(
    'deploy:functions',
    'Deploy Project firebase functions',
    (x) => x,
    () => deployFunctions()
  )
  .command(
    'accounts:get',
    'Get Accounts for a network',
    (args) =>
      args.option('net', {
        type: 'string',
        description: 'Name of network',
        demandOption: true,
      }),
    (args) => printAccounts(args.net)
  )
  .command(
    'accounts:clear',
    'Remova all Accounts for a network',
    (args) =>
      args.option('net', {
        type: 'string',
        description: 'Name of network',
        demandOption: true,
      }),
    (args) => clearAccounts(args.net)
  )
  .command(
    'accounts:add <pk> <address>',
    'Add an account',
    (args) =>
      args
        .option('net', {
          type: 'string',
          description: 'Name of network',
          demandOption: true,
        })
        .positional('pk', {
          type: 'string',
          description: 'Private Key. Format 0x...',
        })
        .positional('address', {
          type: 'string',
          description: 'Address. Format 0x...',
        })
        .demand(['pk', 'address']),
    (args) => addAccount(args.net, args.pk, args.address)
  )
  .command(
    'faucet:request <to>',
    'Request Funds',
    (args) =>
      args
        .option('net', {
          type: 'string',
          description: 'Name of network',
          demand: true,
        })
        .option('to', {
          type: 'string',
          description: 'Address',
          demand: true,
        }),
    (args) => enqueueFundRequest(args.net, args.to)
  )
  .command(
    'config:get',
    'Get Config for a network',
    (args) =>
      args.option('net', {
        type: 'string',
        description: 'Name of network',
      }),
    (args) => printConfig(args.net)
  )
  .command(
    'config:set',
    'Configure the environment',
    (args) =>
      args
        .option('net', {
          type: 'string',
          description: 'Name of network',
          demand: true,
        })
        .option('nodeUrl', {
          type: 'string',
        })
        .option('faucetGoldAmount', {
          type: 'string',
        })
        .option('faucetStableAmount', {
          type: 'string',
        })
        .option('bigFaucetSafeAmount', {
          type: 'string',
          description: "Amount of CELO to be sent to *bigFaucetSafeAddress* each time the script runs"
        })
        .option('bigFaucetSafeAddress', {
          type: 'string',
          description: "Address for the Celo Safe used for distributing large amounts of CELO to developers by request"
        })
        .option('expirySeconds', {
          type: 'number',
          description: 'Seconds before the escrow expires',
        })
        .option('deploy', {
          type: 'boolean',
          description: 'Wether to deploy functions after set config',
        }),
    (args) => {
      setConfig(args.net, {
        faucetGoldAmount: args.faucetGoldAmount,
        faucetStableAmount: args.faucetStableAmount,
        bigFaucetSafeAmount: args.bigFaucetSafeAmount,
        bigFaucetSafeAddress: args.bigFaucetSafeAddress,
        nodeUrl: args.nodeUrl,
        expirySeconds: args.expirySeconds,
      })
      if (args.deploy) {
        deployFunctions()
      }
    }
  ).argv



function setConfig(network: string, config: Partial<NetworkConfig>) {
  const setIfPresent = (name: string, value?: string | number | null) =>
    value ? `faucet.${network}.${name}="${value}"` : ''
  const variables = [
    setIfPresent('node_url', config.nodeUrl),
    setIfPresent('faucet_gold_amount', config.faucetGoldAmount),
    setIfPresent('faucet_stable_amount', config.faucetStableAmount),
    setIfPresent('big_faucet_safe_address', config.bigFaucetSafeAddress),
    setIfPresent('big_faucet_safe_amount', config.bigFaucetSafeAmount),
    setIfPresent('expiry_seconds', config.expirySeconds),
  ].join(' ')
  execSync(`yarn firebase functions:config:set ${variables}`, { stdio: 'inherit' })
}

function printConfig(network?: string) {
  if (network != null) {
    execSync(`yarn firebase functions:config:get faucet.${network}`, { stdio: 'inherit' })
  } else {
    execSync(`yarn firebase functions:config:get faucet`, { stdio: 'inherit' })
  }
}

function printAccounts(network: string) {
  execSync(`yarn firebase database:get --pretty /${network}/accounts`, { stdio: 'inherit' })
}

function enqueueFundRequest(network: string, address: string) {
  const request = {
    beneficiary: address,
    status: 'Pending',
    type: 'Faucet',
  }
  const data = JSON.stringify(request)
  execSync(`yarn firebase database:push  -d '${data}' /${network}/requests`, { stdio: 'inherit' })
}

function addAccount(network: string, pk: string, address: string) {
  const account = {
    pk,
    address,
    locked: false,
  }
  const data = JSON.stringify(account)
  execSync(`yarn firebase database:push  -d '${data}' /${network}/accounts`, { stdio: 'inherit' })
}

function clearAccounts(network: string) {
  execSync(`yarn firebase database:remove  /${network}/accounts`, { stdio: 'inherit' })
}

function deployFunctions() {
  execSync(`yarn firebase deploy --only functions:faucetRequestProcessor,functions:bigFaucetDailyDrip`, {
    stdio: 'inherit',
  })
}

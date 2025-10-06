import { ensureLeading0x } from '@celo/utils/lib/address'
import { execSync } from 'child_process'
import { privateKeyToAddress } from 'viem/accounts'
import yargs from 'yargs'

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
    () => deployFunctions(),
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
    (args) => printAccounts(args.net),
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
    (args) => clearAccounts(args.net),
  )
  .command(
    'accounts:add <pk>',
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
        .demand(['pk']),
    (args) => addAccount(args.net, args.pk),
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
    (args) => enqueueFundRequest(args.net, args.to),
  ).argv

function printAccounts(network: string) {
  execSync(`yarn firebase database:get --pretty /${network}/accounts`, {
    stdio: 'inherit',
  })
}

function enqueueFundRequest(network: string, address: string) {
  const request = {
    beneficiary: address,
    status: 'Pending',
    type: 'Faucet',
  }
  const data = JSON.stringify(request)
  execSync(`yarn firebase database:push  -d '${data}' /${network}/requests`, {
    stdio: 'inherit',
  })
}

function addAccount(network: string, pk: string) {
  const account = {
    pk,
    address: privateKeyToAddress(ensureLeading0x(pk)),
    locked: false,
  }
  const data = JSON.stringify(account)
  execSync(`yarn firebase database:push  -d '${data}' /${network}/accounts`, {
    stdio: 'inherit',
  })
}

function clearAccounts(network: string) {
  execSync(`yarn firebase database:remove  /${network}/accounts`, {
    stdio: 'inherit',
  })
}

function deployFunctions() {
  execSync(`yarn firebase deploy --only functions:faucetRequestProcessor`, {
    stdio: 'inherit',
  })
}

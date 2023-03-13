import * as admin from 'firebase-admin'
import * as functions from 'firebase-functions'
import { getNetworkConfig } from './config'
import { AccountPool, fundBigFaucet, processRequest } from './database-helper'

const PROCESSOR_RUNTIME_OPTS: functions.RuntimeOptions = {
  // When changing this, check that actionTimeoutMS is less than this number
  timeoutSeconds: 120,
  memory: '512MB',
}
admin.initializeApp(functions.config().firebase)

const db = admin.database()

const SECOND = 1000

export const faucetRequestProcessor = functions
  .runWith(PROCESSOR_RUNTIME_OPTS)
  .database.ref('/{network}/requests/{request}')
  .onCreate(async (snap, ctx) => {
    const network: string = ctx.params.network
    const config = getNetworkConfig(network)
    const pool = new AccountPool(db, network, {
      retryWaitMS: SECOND,
      getAccountTimeoutMS: 20 * SECOND,
      actionTimeoutMS: 90 * SECOND,
    })
    return processRequest(snap, pool, config)
  })

export const bigFaucetFunder = functions.pubsub.schedule('every sunday 02:00').onRun(async (context) => {
  const network = 'alfajores'
  const config = getNetworkConfig(network)
    const pool = new AccountPool(db, network, {
      retryWaitMS: SECOND * 4,
      getAccountTimeoutMS: 30 * SECOND,
      actionTimeoutMS: 120 * SECOND,
    })

    console.log(`Big drip running on ${context.resource.name} with ${config.bigFaucetSafeAmount} CELO + ${config.bigFaucetSafeStablesAmount} cStables for ${config.bigFaucetSafeAddress}`)
    await fundBigFaucet(pool, config)
})

// From https://firebase.googleblog.com/2019/04/schedule-cloud-functions-firebase-cron.html
// export const scheduledFunctionCrontab = functions.pubsub.schedule('5 11 * * *').onRun((context) => {
//   console.log('This will be run every day at 11:05 AM UTC!')
// })

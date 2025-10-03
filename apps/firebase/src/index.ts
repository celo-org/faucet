import {
  applicationDefault,
  AppOptions,
  initializeApp,
} from 'firebase-admin/app'
import { getDatabase } from 'firebase-admin/database'
import { setGlobalOptions } from 'firebase-functions/v2'
import { onValueCreated } from 'firebase-functions/v2/database'
import {
  DATABASE_URL,
  DB_POOL_OPTS,
  getNetworkConfig,
  PROCESSOR_RUNTIME_OPTS,
  SERVICE_ACCOUNT,
} from './config'
import { AccountPool, processRequest } from './database-helper'

setGlobalOptions({
  serviceAccount: SERVICE_ACCOUNT,
})

const app = initializeApp({
  credential: applicationDefault(),
  databaseURL: DATABASE_URL,
} as AppOptions)

export const faucetRequestProcessor = onValueCreated(
  PROCESSOR_RUNTIME_OPTS,
  async (event) => {
    const network = event.params.network
    const config = getNetworkConfig(network)
    const pool = new AccountPool(getDatabase(app), network, DB_POOL_OPTS)
    return processRequest(event.data, pool, config)
  },
)

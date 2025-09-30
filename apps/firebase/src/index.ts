import { initializeApp } from 'firebase-admin/app'
import { getDatabase } from 'firebase-admin/database'
import { onValueCreated } from 'firebase-functions/v2/database'
import {
  DB_POOL_OPTS,
  getNetworkConfig,
  PROCESSOR_RUNTIME_OPTS,
} from './config'
import { AccountPool, processRequest } from './database-helper'

initializeApp()

export const faucetRequestProcessor = onValueCreated(
  PROCESSOR_RUNTIME_OPTS,
  async (event) => {
    const network = event.params.network
    const config = getNetworkConfig(network)
    const pool = new AccountPool(getDatabase(), network, DB_POOL_OPTS)
    return processRequest(event.data, pool, config)
  },
)

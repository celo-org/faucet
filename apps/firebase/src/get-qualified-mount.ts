import { NetworkConfig } from './config'
import { AuthLevel } from './database-helper'

export function getQualifiedAmount(
  authLevel: AuthLevel,
  config: NetworkConfig,
): { celoAmount: bigint } {
  switch (authLevel) {
    case undefined:
    case AuthLevel.none:
      return {
        celoAmount: config.faucetGoldAmount,
      }
    case AuthLevel.authenticated:
      return {
        celoAmount: config.authenticatedGoldAmount,
      }
  }
}

import { describe, expect, it } from 'vitest'
import { NetworkConfig } from './config'
import { AuthLevel } from './database-helper'
import { getQualifiedAmount } from './get-qualified-mount'

describe('getQualifiedAmount', () => {
  const mockConfig: NetworkConfig = {
    nodeUrl: '',
    faucetGoldAmount: 100n,
    authenticatedGoldAmount: 200n,
  }

  it('should return faucetGoldAmount for undefined authLevel', () => {
    // @ts-expect-error
    const result = getQualifiedAmount(undefined, mockConfig)
    expect(result.celoAmount).toBe(mockConfig.faucetGoldAmount)
  })

  it('should return faucetGoldAmount for AuthLevel.none', () => {
    const result = getQualifiedAmount(AuthLevel.none, mockConfig)
    expect(result.celoAmount).toBe(mockConfig.faucetGoldAmount)
  })

  it('should return authenticatedGoldAmount for AuthLevel.authenticated', () => {
    const result = getQualifiedAmount(AuthLevel.authenticated, mockConfig)
    expect(result.celoAmount).toBe(mockConfig.authenticatedGoldAmount)
  })
})

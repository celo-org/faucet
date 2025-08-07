import { describe, expect, it } from 'vitest'
import { AuthLevel } from './database-helper'
import { getQualifiedAmount } from './get-qualified-mount'

describe('getQualifiedAmount', () => {
  const mockConfig = {
    faucetGoldAmount: '100',
    authenticatedGoldAmount: '200',
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

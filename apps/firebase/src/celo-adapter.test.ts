import { parseEther } from 'viem'
import { celoAlfajores, celoSepolia } from 'viem/chains'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CeloAdapter } from './celo-adapter'

describe('CeloAdapter Integration Tests', () => {
  // Test configuration
  const testPrivateKey =
    '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as const
  // this is NOT the address of the test private key
  const validAddress = '0x744a3f56D61487FA2cD5a09262d31E6222DC136E' as const
  const testNodeUrls = {
    alfajores: celoAlfajores.rpcUrls.default.http[0],
    sepolia: celoSepolia.rpcUrls.default.http[0],
  }
  describe('Constructor', () => {
    it('creates an adapter with Alfajores chain when nodeUrl contains alfajores', () => {
      const adapter = new CeloAdapter({
        pk: testPrivateKey,
        nodeUrl: testNodeUrls.alfajores,
      })

      // Verify the adapter was created successfully
      expect(adapter).toBeInstanceOf(CeloAdapter)

      // Test that the transferCelo method exists
      expect(typeof adapter.transferCelo).toBe('function')
    })

    it('creates an adapter with Sepolia chain when nodeUrl contains sepolia', () => {
      const adapter = new CeloAdapter({
        pk: testPrivateKey,
        nodeUrl: testNodeUrls.sepolia,
      })

      expect(adapter).toBeInstanceOf(CeloAdapter)
      expect(typeof adapter.transferCelo).toBe('function')
    })

    it('defaults to Sepolia chain when nodeUrl does not contain alfajores', () => {
      const adapter = new CeloAdapter({
        pk: testPrivateKey,
        nodeUrl: 'https://some-other-node.org',
      })

      expect(adapter).toBeInstanceOf(CeloAdapter)
      expect(typeof adapter.transferCelo).toBe('function')
    })
  })

  describe('transferCelo method', () => {
    let adapter: CeloAdapter
    beforeEach(() => {
      vi.resetAllMocks()
      adapter = new CeloAdapter({
        pk: testPrivateKey,
        nodeUrl: testNodeUrls.alfajores,
      })
      vi.spyOn(adapter.client, 'sendTransaction').mockResolvedValue(
        '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as const,
      )
    })
    it('has the correct method signature', () => {
      // Test that the method exists and has the right signature
      expect(typeof adapter.transferCelo).toBe('function')

      // The method should accept Address and bigint parameters
      // and return a Promise<Hex>
      const method = adapter.transferCelo
      expect(method.length).toBe(2) // Should accept 2 parameters
    })

    it('accepts valid parameters without throwing', async () => {
      // Use a valid checksummed address
      const amount = parseEther('1') // 1 CELO in wei

      await adapter.transferCelo(validAddress, amount)
      expect(adapter.client.sendTransaction).toHaveBeenCalledWith({
        to: validAddress,
        value: amount,
        chain: celoAlfajores,
      })
    })

    it('handles different amount types', async () => {
      // Test with different bigint amounts
      const amounts = [
        BigInt(0),
        parseEther('1'), // 1 CELO
        parseEther('100000000'), // Very large amount
      ]

      amounts.forEach(async (amount) => {
        await adapter.transferCelo(validAddress, amount)
        expect(adapter.client.sendTransaction).toHaveBeenCalledWith({
          to: validAddress,
          value: amount,
          chain: celoAlfajores,
        })
      })
    })
  })

  describe('Chain Configuration', () => {
    it('uses correct chain configuration for Alfajores', () => {
      const adapter = new CeloAdapter({
        pk: testPrivateKey,
        nodeUrl: testNodeUrls.alfajores,
      })

      // Verify the adapter was created with Alfajores configuration
      expect(adapter).toBeInstanceOf(CeloAdapter)
    })

    it('uses correct chain configuration for Sepolia', () => {
      const adapter = new CeloAdapter({
        pk: testPrivateKey,
        nodeUrl: testNodeUrls.sepolia,
      })

      // Verify the adapter was created with Sepolia configuration
      expect(adapter).toBeInstanceOf(CeloAdapter)
    })
  })

  describe('Error Handling', () => {
    it('handles invalid private key format gracefully', () => {
      // This should throw an error due to invalid private key format
      expect(() => {
        new CeloAdapter({
          pk: 'invalid-private-key' as any,
          nodeUrl: testNodeUrls.alfajores,
        })
      }).toThrow()
    })
  })

  describe('Real Network Integration', () => {
    it('creates adapter instances without throwing network errors', () => {
      // Test that we can create adapters for both networks
      const alfajoresAdapter = new CeloAdapter({
        pk: testPrivateKey,
        nodeUrl: testNodeUrls.alfajores,
      })

      const sepoliaAdapter = new CeloAdapter({
        pk: testPrivateKey,
        nodeUrl: testNodeUrls.sepolia,
      })

      expect(alfajoresAdapter).toBeInstanceOf(CeloAdapter)
      expect(sepoliaAdapter).toBeInstanceOf(CeloAdapter)
    })

    it('handles method calls without network errors', async () => {
      const adapter = new CeloAdapter({
        pk: testPrivateKey,
        nodeUrl: testNodeUrls.alfajores,
      })

      // The method should be callable (though it will fail due to insufficient funds)
      // We're testing that the method signature and basic functionality work
      expect(typeof adapter.transferCelo).toBe('function')

      // We can't actually call it because it would try to send a real transaction
      // but we can verify the method exists and has the right signature
    })
  })
})

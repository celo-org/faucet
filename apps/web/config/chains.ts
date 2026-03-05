import { Network } from 'types'
import { celoSepolia } from 'viem/chains'

interface ChainParams {
  chainId: `0x${string}`
  chainName: string
  nativeCurrency: {
    name: string
    symbol: string
    decimals: number
  }
  rpcUrls: string[]
  blockExplorerUrls: string[]
  iconUrls: string[]
}

export const CHAIN_PARAMS: Record<Network, ChainParams> = [
  { ...celoSepolia, network: 'celo-sepolia' as Network },
].reduce(
  (acc, chain) => {
    acc[chain.network] = {
      chainId: `0x${chain.id.toString(16)}`,
      chainName: chain.name,
      nativeCurrency: {
        name: chain.nativeCurrency.name,
        symbol: chain.nativeCurrency.symbol,
        decimals: chain.nativeCurrency.decimals,
      },
      rpcUrls: [...chain.rpcUrls.default.http],
      blockExplorerUrls: [chain.blockExplorers.default.url],
      iconUrls: ['future'], // Placeholder for future icons
    }
    return acc
  },
  {} as Record<Network, ChainParams>,
)

interface Token {
  symbol: string
  address: `0x${string}`
}

export const tokens: Record<Network, Token[]> = {
  'celo-sepolia': [],
}

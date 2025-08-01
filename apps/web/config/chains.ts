import { Network } from 'types'
import { celoAlfajores, celoSepolia } from 'viem/chains'

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
  { ...celoAlfajores, network: 'alfajores' as Network },
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
  alfajores: [
    {
      symbol: 'cEUR',
      address: '0x10c892A6EC43a53E45D0B916B4b7D383B1b78C0F',
    },
    {
      symbol: 'cREAL',
      address: '0xE4D517785D091D3c54818832dB6094bcc2744545',
    },
    {
      symbol: 'cUSD',
      address: '0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1',
    },
  ],
  'celo-sepolia': [],
}

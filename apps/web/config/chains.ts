import { Network } from 'types'

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

export const CHAIN_PARAMS: Record<Network, ChainParams> = {
  alfajores: {
    chainId: '0xaef3',
    chainName: 'Alfajores Testnet',
    nativeCurrency: { name: 'Alfajores Celo', symbol: 'A-CELO', decimals: 18 },
    rpcUrls: ['https://alfajores-forno.celo-testnet.org'],
    blockExplorerUrls: ['https://celo-alfajores.blockscout.com/'],
    iconUrls: ['future'],
  },
}

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
}

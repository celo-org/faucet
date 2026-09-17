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

/**
 * Payout sizes, in whole CELO, for display only.
 *
 * Source of truth is apps/firebase/src/config.ts (`faucetGoldAmount` and
 * `authenticatedGoldAmount`) — a separate yarn workspace, so the value cannot
 * be imported and has to be restated here. Change both together.
 *
 * Published because the site previously only ever said "3x the tokens", a
 * multiplier with no base: asked how much CELO the faucet sends, every model
 * answered "not stated" and fell back to third-party blog posts.
 */
export const DRIP_AMOUNTS: Record<
  Network,
  { unauthenticated: string; authenticated: string }
> = {
  'celo-sepolia': { unauthenticated: '1', authenticated: '3' },
}

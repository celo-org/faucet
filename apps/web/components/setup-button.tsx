import detectEthereumProvider from '@metamask/detect-provider'
import Image from 'next/image'
import { FC } from 'react'
import { useAsyncCallback } from 'react-use-async-callback'
import { ChainId, Network } from 'types'
import { capitalize } from 'utils/capitalize'
import { inter } from 'utils/inter'
import { CHAIN_PARAMS, tokens } from '../config/chains'

interface Props {
  network: Network
}

export const SetupButton: FC<Props> = ({ network }) => {
  const networkCapitalized = capitalize(network)

  const [importTokens, { isExecuting }] = useAsyncCallback(async () => {
    const provider = (await detectEthereumProvider()) as EthProvider

    if (provider?.request) {
      try {
        if (provider.chainId && Number(provider.chainId) !== ChainId[network]) {
          const result = await provider.request({
            method: 'wallet_addEthereumChain',
            params: [CHAIN_PARAMS[network]],
          })

          console.info('network added', result)

          // need to wait longer than just the await for the metamask popup to show
          await delay(3_000)
        }
        await Promise.all(
          chainTokenParams[network].map((params) =>
            provider.request({
              method: 'wallet_watchAsset',
              params,
            }),
          ),
        )
      } catch (e: any) {
        console.error(e)
        alert(`Unable to complete: ${e.message}`)
      }
    } else {
      alert('Wallet Not Detected')
    }
  }, [])

  return (
    <button
      onClick={importTokens}
      disabled={isExecuting}
      className="flex flex-col"
    >
      <h3 className={inter.className}>
        <Image alt="Metamask" height={24} width={24} src="/meta-mask-fox.svg" />{' '}
        Add Celo Testnet <span>→</span>
      </h3>
      <p className={inter.className}>
        Enable {networkCapitalized} and Add CELO to your Wallet
      </p>
    </button>
  )
}

function delay(time: number) {
  return new Promise((resolve) => setTimeout(resolve, time))
}

interface TokenParams {
  type: 'ERC20'
  options: {
    address: string
    symbol: string
    decimals: 18
    image: string
  }
}
const chainTokenParams = Object.keys(tokens).reduce<
  Record<Network, TokenParams[]>
>(
  (params, network) => {
    params[network as Network] = tokens[network as Network].map(
      ({ symbol, address }) => ({
        type: 'ERC20',
        options: {
          address,
          symbol,
          decimals: 18,
          image: `https://reserve.mento.org/assets/tokens/${symbol}.svg`, // A string url of the token logo
        },
      }),
    )
    return params
  },
  {} as Record<Network, TokenParams[]>,
)

interface EthProvider {
  request: (a: { method: string; params?: unknown }) => Promise<void>
  chainId: string
  isMetaMask?: boolean
  once(eventName: string | symbol, listener: (...args: any[]) => void): this
  on(eventName: string | symbol, listener: (...args: any[]) => void): this
  off(eventName: string | symbol, listener: (...args: any[]) => void): this
  addListener(
    eventName: string | symbol,
    listener: (...args: any[]) => void,
  ): this
  removeListener(
    eventName: string | symbol,
    listener: (...args: any[]) => void,
  ): this
  removeAllListeners(event?: string | symbol): this
}

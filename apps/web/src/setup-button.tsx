import { FC } from 'react'
import detectEthereumProvider from '@metamask/detect-provider'
import { useAsyncCallback } from 'react-use-async-callback'
import Image from 'next/image'
import { inter } from 'src/inter'
import styles from 'styles/Home.module.css'
import { Network, ChainId } from 'src/faucet-interfaces'

interface Props {
  network: Network
}

export const SetupButton: FC<Props> = ({ network }) => {
  const networkCapitalized = `${network[0].toUpperCase()}${network
    .slice(1)
    .toLowerCase()}`

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
            })
          )
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
      className={styles.card}
      disabled={isExecuting}
    >
      <h3 className={inter.className}>
        <Image alt="Metamask" height={24} width={24} src="/meta-mask-fox.svg" />{' '}
        Add Celo Testnet <span>&gt;</span>
      </h3>
      <p className={inter.className}>
        Enable {networkCapitalized} and Register Mento tokens in Metamask
      </p>
    </button>
  )
}

function delay(time: number) {
  return new Promise((resolve) => setTimeout(resolve, time))
}

const tokens = {
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
  cannoli: [
    {
      symbol: 'cEUR',
      address: '0x6ede0baedEb76CdF45B40f79bb466759B9EfF1a0',
    },
    {
      symbol: 'cREAL',
      address: '0xAa6ba7cFB47C2FC36Cc842eEf67889519ebEF9a7',
    },
    {
      symbol: 'cUSD',
      address: '0x2Bece2F1e31237085A0da4BB12F091D38d832431',
    },
  ],
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
>((params, network) => {
  params[network as Network] = tokens[network as Network].map(
    ({ symbol, address }) => ({
      type: 'ERC20',
      options: {
        address,
        symbol,
        decimals: 18,
        image: `https://reserve.mento.org/assets/tokens/${symbol}.svg`, // A string url of the token logo
      },
    })
  )
  return params
}, {} as Record<Network, TokenParams[]>)

interface EthProvider {
  request: (a: { method: string; params?: unknown }) => Promise<void>
  chainId: string
  isMetaMask?: boolean
  once(eventName: string | symbol, listener: (...args: any[]) => void): this
  on(eventName: string | symbol, listener: (...args: any[]) => void): this
  off(eventName: string | symbol, listener: (...args: any[]) => void): this
  addListener(
    eventName: string | symbol,
    listener: (...args: any[]) => void
  ): this
  removeListener(
    eventName: string | symbol,
    listener: (...args: any[]) => void
  ): this
  removeAllListeners(event?: string | symbol): this
}

const CHAIN_PARAMS = {
  alfajores: {
    chainId: '0xaef3',
    chainName: 'Alfajores Testnet',
    nativeCurrency: { name: 'Alfajores Celo', symbol: 'A-CELO', decimals: 18 },
    rpcUrls: ['https://alfajores-forno.celo-testnet.org'],
    blockExplorerUrls: ['https://explorer.celo.org/alfajores'],
    iconUrls: ['future'],
  },
  cannoli: {
    chainId: '0x43ab',
    chainName: 'Cannoli Testnet',
    nativeCurrency: { name: 'Cannoli Celo', symbol: 'C-CELO', decimals: 18 },
    rpcUrls: ['https://forno.cannoli.celo-testnet.org'],
    blockExplorerUrls: ['https://explorer.celo.org/cannoli'],
    iconUrls: ['future'],
  },
}

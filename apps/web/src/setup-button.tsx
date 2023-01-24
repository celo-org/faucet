import detectEthereumProvider from '@metamask/detect-provider'
import { useAsyncCallback } from 'react-use-async-callback'
import styles from 'styles/Home.module.css'
import { inter } from '../pages/index'

const tokens = [
  {
    symbol: "cEUR",
    address: "0x10c892A6EC43a53E45D0B916B4b7D383B1b78C0F",
  },
  {
    symbol: "cREAL",
    address: "0xE4D517785D091D3c54818832dB6094bcc2744545"
  },
  {
    symbol: "cUSD",
    address: "0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1"
  }
]
const tokenParams = tokens.map(({ symbol, address }) => {
  return {
    type: 'ERC20',
    options: {
      address: address,
      symbol: symbol,
      decimals: 18,
      image: `https://reserve.mento.org/assets/tokens/${symbol}.svg`, // A string url of the token logo
    },
  }
})
interface EthProvider {
  request: (a: { method: string; params?: unknown} ) => Promise<void>
  chainId: string
  isMetaMask?: boolean
  once(eventName: string | symbol, listener: (...args: any[]) => void): this
  on(eventName: string | symbol, listener: (...args: any[]) => void): this
  off(eventName: string | symbol, listener: (...args: any[]) => void): this
  addListener(eventName: string | symbol, listener: (...args: any[]) => void): this
  removeListener(eventName: string | symbol, listener: (...args: any[]) => void): this
  removeAllListeners(event?: string | symbol): this
}
const ALFAJORES_CHAIN_ID = 44787
const ALFAJORES_PARAMS = {
  chainId: "0xaef3",
  chainName: "Alfajores Testnet",
  nativeCurrency: { name: "Alfajores Celo", symbol: "A-CELO", decimals: 18 },
  rpcUrls: ["https://alfajores-forno.celo-testnet.org"],
  blockExplorerUrls: ["https://alfajores-blockscout.celo-testnet.org/"],
  iconUrls: ["future"],
}
export function SetupButton() {


  const [importTokens, {isExecuting }] = useAsyncCallback(async () => {
    const provider = await detectEthereumProvider() as EthProvider

    if (provider?.request) {
      try {
        if (provider.chainId && Number(provider.chainId) !== ALFAJORES_CHAIN_ID) {
          const result = await provider.request({
            method: 'wallet_addEthereumChain',
            params: [ALFAJORES_PARAMS],
          })

          console.info("network added",result)

          // need to wait longer than just the await for the metamask popup to show
          await delay(3_000)
        }
        await Promise.all(
          tokenParams.map((params) => provider.request({
            method: 'wallet_watchAsset',
            params,
          }))
        )
      } catch (e: any) {
        console.error(e)
        alert(`Unable to complete: ${e.message}`)
      }
    } else {
      alert("Wallet Not Detected")
    }
  }, [])

  return <button
    onClick={importTokens}
    className={styles.card}
    disabled={isExecuting}
  >
    <h3 className={inter.className}>
      <img height={24} width={24} src="/meta-mask-fox.svg"/> Setup Wallet <span>&gt;</span>
    </h3>
    <p className={inter.className}>
      Enable Alfajores and Register Mento tokens in Metamask
    </p>
  </button>
}


function delay(time: number) {
  return new Promise(resolve => setTimeout(resolve, time));
}

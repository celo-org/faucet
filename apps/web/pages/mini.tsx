import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Inter } from 'next/font/google'
import React, { FC, FormEvent, useCallback, useEffect, useRef, useState } from "react"
import { useAsyncCallback } from 'react-use-async-callback'
import { Hex, isAddress } from 'viem'
import { celoAlfajores } from 'viem/chains'
import {
  useAccount,
  useChainId,
  useConnect,
  usePublicClient,
  useSignTypedData,
  useWaitForTransactionReceipt,
  WagmiProvider
} from 'wagmi'

import { sdk } from "@farcaster/frame-sdk"
import { config } from "../config/wagmi"
import farcasterStyles from '../styles/Farcaster.module.css'
import styles from '../styles/Form.module.css'
import {
  EIP712Domain,
  FaucetRequest,
  FaucetRequest712Type,
  FaucetResponce,
} from '../utils/mini-faucet'

export const inter = Inter({ subsets: ['latin'] })



function App() {
  useEffect(() => {
    // this is a promise that resolves when we are ready 
    void sdk.actions.ready();
  }, []);
  return (
    <div className={farcasterStyles.main}>
      <h1 className={inter.className}>Celo Tap (Alpha)</h1>
      <ConnectMenu />
    </div>
  );
}

function ConnectMenu() {
  const { isConnected, address } = useAccount();
  const { connect, connectors } = useConnect();

  if (isConnected) {
    return (
      <>
        <MiniFaucet />
      </>
    );
  }

  return (
    <button type="button" onClick={() => connect({ connector: connectors[0] })}>
      Connect
    </button>
  );
}


const queryClient = new QueryClient();

export default function Main() {
  return (
     <React.StrictMode>
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </WagmiProvider>
    </React.StrictMode>
  )
};



export const MiniFaucet: FC = () => {
  const inputRef = useRef<HTMLInputElement>(null)

  const { signTypedDataAsync } = useSignTypedData()
  const account = useAccount()
  const connectedChainID = useChainId()
  const client = usePublicClient()
  const [txHash, setTXhash] = useState<Hex | undefined>()

  const receipt = useWaitForTransactionReceipt({ hash: txHash })


  const [onSubmit, { isExecuting, errors }] = useAsyncCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()

      const beneficiary = inputRef.current?.value
      console.info('begin tap sequence')
      if (
        !beneficiary?.length ||
        !isAddress(beneficiary) ||
        !account.address ||
        !client
      ) {
        console.info('aborting')
        return
      }

      const message: FaucetRequest['message'] = {
        beneficiary,
        verification: 'farcaster',
        chainId: celoAlfajores.id,
      }

      const signature = await signTypedDataAsync({
        domain: EIP712Domain(connectedChainID),
        types: FaucetRequest712Type.types,
        primaryType: FaucetRequest712Type.primaryType,
        message,
      })

      const request: FaucetRequest = {
        signer: account.address,
        signature,
        domain: EIP712Domain(connectedChainID),
        message,
      }

      const response = await fetch('api/tap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      })
      // TODO get key from result and set
      const result = (await response.json()) as FaucetResponce
      // TODO show the tx hash and wait for it in the UI
      if (result.ok) {
        setTXhash(result.hash)
      } else {
        throw new Error(result.message)
      }
    },
    [
      inputRef,
      client,
      signTypedDataAsync,
      celoAlfajores.id,
      account.address,
    ],
  )

  const onInvalid = useCallback((event: FormEvent<HTMLInputElement>) => {
    const { validity } = event.currentTarget
    console.debug('validity input', JSON.stringify(validity))
    if (validity.patternMismatch || validity.badInput || !validity.valid) {
      event.currentTarget.setCustomValidity('enter an 0x address')
    } else {
      event.currentTarget.setCustomValidity('')
    }
  }, [])

  const buttonDisabled =
    isExecuting ||
    receipt.isLoading ||
    !account.address

  return (
    <>
      <div className={styles.intro}>
        {txHash && (
          <div className={styles.success}>
            <p className={styles.successText}>
              Your request has been submitted! Check the transaction{' '}
              <a
                className={styles.txLink}
                href={`https://alfajores.celoscan.io/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                here
              </a>
            </p>
          </div>
        )}
      </div>
      <form
        className={styles.center}
        onSubmit={onSubmit}
        action="api/request2"
        method="post"
      >
        <label className={styles.center}>
          <span className={styles.label}>Account Address</span>
          <input
            defaultValue={account.address}
            onInvalid={onInvalid}
            minLength={40}
            ref={inputRef}
            pattern="^0x[a-fA-F0-9]{40}"
            type="text"
            placeholder="0x01F10..."
            className={styles.address}
          />
        </label>
        <button
          disabled={buttonDisabled}
          className={styles.button}
          type="submit"
        >
          {'Tap for tCELO'}
        </button>
      </form>
    </>
  )
}

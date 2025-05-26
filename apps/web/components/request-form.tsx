import { Inter } from 'next/font/google'
import { FC, FormEvent, useCallback, useRef, useState } from 'react'
import { useAsyncCallback } from 'react-use-async-callback'
import { Hex, isAddress } from 'viem'
import { celoAlfajores } from 'viem/chains'
import {
  useAccount,
  useChainId,
  usePublicClient,
  useSignTypedData,
  useWaitForTransactionReceipt,
  useWatchBlocks,
} from 'wagmi'
import {
  EIP712Domain,
  FaucetRequest,
  FaucetRequest712Type,
} from 'utils/simple-faucet'
import styles from 'styles/Form.module.css'
import type { FaucetResponce } from 'pages/api/request2'

export const inter = Inter({ subsets: ['latin'] })

export const RequestForm: FC = () => {
  const inputRef = useRef<HTMLInputElement>(null)

  const { signTypedDataAsync } = useSignTypedData()
  const chainId = useChainId()
  const account = useAccount()
  const client = usePublicClient()
  const [latestKnownBlockHash, setBlockHash] = useState<Hex>('0x')
  const [txHash, setTXhash] = useState<Hex | undefined>()

  const receipt = useWaitForTransactionReceipt({ hash: txHash })

  useWatchBlocks({
    onBlock: (block) => {
      setBlockHash(block.hash)
    },
  })

  const [onSubmit, { isExecuting, errors }] = useAsyncCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()

      const beneficiary = inputRef.current?.value
      console.info('begin faucet sequence')
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
        verification: 'none', // TODO: make this dynamic
        blockHash: latestKnownBlockHash,
      }

      const signature = await signTypedDataAsync({
        domain: EIP712Domain(chainId as typeof celoAlfajores.id),
        types: FaucetRequest712Type.types,
        primaryType: FaucetRequest712Type.primaryType,
        message,
      })

      const request: FaucetRequest = {
        signer: account.address,
        signature,
        domain: EIP712Domain(chainId as typeof celoAlfajores.id),
        message,
      }

      const response = await fetch('api/request2', {
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
      latestKnownBlockHash,
      signTypedDataAsync,
      chainId,
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
    latestKnownBlockHash === '0x' ||
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
          {'Claim CELO'}
        </button>
      </form>
    </>
  )
}

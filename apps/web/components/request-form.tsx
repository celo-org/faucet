import { TxMessage } from 'components/TxMessage'
import { isUsingNewFaucetService, networkToChainId } from 'config/chains'
import { useSession } from 'next-auth/react'
import dynamic from 'next/dynamic'
import { Inter } from 'next/font/google'
import Link from 'next/link'
import { FC, FormEvent, useCallback, useRef, useState } from 'react'
import { useGoogleReCaptcha } from 'react-google-recaptcha-v3'
import { useAsyncCallback } from 'react-use-async-callback'
import styles from 'styles/Form.module.css'
import { Faucet2APIResponse, FaucetAPIResponse, Network } from 'types'
import { saveAddress } from 'utils/history'
import { useLastAddress } from 'utils/useLastAddress'

const FaucetStatus = dynamic(async () => {
  const imported = await import('components/faucet-status')
  return imported.FaucetStatus
}, {})
export const inter = Inter({ subsets: ['latin'] })

interface Props {
  isOutOfCELO: boolean
  network: Network
}

export const RequestForm: FC<Props> = ({ isOutOfCELO, network }) => {
  const inputRef = useRef<HTMLInputElement>(null)
  const { data: session } = useSession()

  const chainIsUsingNewFaucetService = isUsingNewFaucetService(networkToChainId(network))

  const { executeRecaptcha } = useGoogleReCaptcha()
  const [txHash, setTxHash] = useState<string | null>(null)
  const [faucetRequestKey, setKey] = useState<string | null>(null)
  const [failureStatus, setFailureStatus] = useState<string | null>(null)

  const disableCELOWhenOut = isOutOfCELO

  const [onSubmit, { isExecuting, errors }] = useAsyncCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()

      const beneficiary = inputRef.current?.value
      console.info('begin faucet sequence')
      if (!beneficiary?.length || !executeRecaptcha) {
        console.info('aborting')
        return
      }
      // save to local storage
      saveAddress(beneficiary)

      const captchaToken = await executeRecaptcha('faucet')
      if (chainIsUsingNewFaucetService) {
        const response2 = await fetch('api/tap', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            captchaToken,
            to: beneficiary,
            chainId: networkToChainId(network),
          }),
        })
        const result2 = (await response2.json()) as Faucet2APIResponse
        console.info('faucet request sent...received')
        if (result2.status === 'Failed') {
          console.warn(result2.message)
          setFailureStatus(result2.message)
        } else {
          setTxHash(result2.txHash)
        }
        return
      }

      console.info('received captcha token...posting faucet request')
      const response = await fetch('api/faucet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          beneficiary,
          captchaToken,
          skipStables: true,
          network,
        }),
      })
      const result = (await response.json()) as FaucetAPIResponse
      console.info('faucet request sent...received')
      if (result.status === 'Failed') {
        console.warn(result.message)
        setFailureStatus(result.message)
      } else {
        setKey(result.key)
      }
    },
    [inputRef, executeRecaptcha, chainIsUsingNewFaucetService, network],
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

  const reset = useCallback(() => {
    setFailureStatus(null)
    setKey(null)
  }, [])

  const previousAddress = useLastAddress()
  const buttonDisabled =
    !executeRecaptcha || !!faucetRequestKey || disableCELOWhenOut

  return (
    <>
      <div className={styles.intro}>
        <p className={`${inter.className} ${styles.center}`}>
          {!session && (
            <em>
              <Link
                className={styles.githubAuthenticate}
                href="/api/auth/signin/github"
              >
                Authenticate with GitHub
              </Link>{' '}
              to receive 10x the tokens.
            </em>
          )}
        </p>
      </div>
      <form
        className={styles.center}
        onSubmit={onSubmit}
        action="api/faucet"
        method="post"
      >
        <label className={styles.center}>
          <span className={styles.label}>Account Address</span>
          <input
            defaultValue={previousAddress}
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



        {chainIsUsingNewFaucetService ? (
          <>{isExecuting ? <span className={inter.className}>Awaiting TX Hash...</span> : <TxMessage txHash={txHash} network={network} />}</>
        ) : (
        <FaucetStatus
          network={network}
          reset={reset}
          failureStatus={failureStatus}
          faucetRequestKey={faucetRequestKey}
          isExecuting={isExecuting || !!faucetRequestKey}
          errors={errors}
        />
        )}
      </form>
    </>
  )
}

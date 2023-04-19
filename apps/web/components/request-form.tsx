import { FC, FormEvent, useCallback, useRef, useState } from 'react'
import { Inter } from 'next/font/google'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useGoogleReCaptcha } from 'react-google-recaptcha-v3'
import { useAsyncCallback } from 'react-use-async-callback'
import { FaucetAPIResponse, Network } from 'types'
import { saveAddress } from 'utils/history'
import { useLastAddress } from 'utils/useLastAddress'
import styles from 'styles/Form.module.css'

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

  const { executeRecaptcha } = useGoogleReCaptcha()
  const [skipStables, setSkipStables] = useState(true)

  const toggleStables = useCallback(() => {
    setSkipStables(!skipStables)
  }, [skipStables])

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
      console.info('received captcha token...posting faucet request')
      const response = await fetch('api/faucet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          beneficiary,
          captchaToken,
          skipStables,
          network,
        }),
      })
      // TODO get key from result and set
      const result = (await response.json()) as FaucetAPIResponse
      console.info('faucet request sent...received')
      if (result.status === 'Failed') {
        console.warn(result.message)
        setFailureStatus(result.message)
      } else {
        setKey(result.key)
      }
    },
    [inputRef, executeRecaptcha, skipStables]
  )

  const onInvalid = useCallback((event: FormEvent<HTMLInputElement>) => {
    const { validity } = event.currentTarget
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
          Enter your testnet address below.
          {!session && (
            <Link
              className={styles.githubAuthenticate}
              href="/api/auth/signin/github"
            >
              Authenticate with GitHub to receive more tokens.
            </Link>
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
          {'Faucet'}
        </button>
        <label>
          <input
            onChange={toggleStables}
            name="token-request"
            value={'skip-stables'}
            type={'checkbox'}
            defaultChecked={skipStables}
          />
          <small className={inter.className}> CELO Only</small>
        </label>
        <FaucetStatus
          network={network}
          reset={reset}
          failureStatus={failureStatus}
          faucetRequestKey={faucetRequestKey}
          isExecuting={isExecuting || !!faucetRequestKey}
          errors={errors}
        />
      </form>
    </>
  )
}

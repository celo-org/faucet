import { Inter } from '@next/font/google'
import dynamic from 'next/dynamic'
import { FormEvent, useCallback, useRef, useState } from 'react'
import { useGoogleReCaptcha } from 'react-google-recaptcha-v3'
import { useAsyncCallback } from 'react-use-async-callback'
import { FaucetAPIResponse } from 'src/faucet-interfaces'
import { saveAddress } from 'src/history'
import { useLastAddress } from 'src/useLastAddress'
import styles from 'styles/Form.module.css'

const FaucetStatus = dynamic(() => import('src/faucet-status'), {})
export const inter = Inter({ subsets: ['latin'] })

interface Props {
  isOutOfCELO: boolean
}

const STANDARD_AMOUNT = 2.5

export default function RequestForm({isOutOfCELO}:Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  const { executeRecaptcha } = useGoogleReCaptcha();
  const [skipStables, setSkipStables] = useState(true)

  const toggleStables= useCallback(() => {
      setSkipStables(!skipStables)
  }, [skipStables])

  const [faucetRequestKey, setKey] = useState<string | null>(null)
  const [failureStatus, setFailureStatus] = useState<string | null>(null)

  const disableCELOWhenOut = isOutOfCELO

  const [onSubmit, {isExecuting, errors}] = useAsyncCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const beneficiary = inputRef.current?.value
    console.info('begin faucet sequence')
    if (!beneficiary?.length || !executeRecaptcha) {
      console.info('aborting')
      return
    }
    // save to local storage
    saveAddress(beneficiary)

    const captchaToken = await executeRecaptcha('faucet');
    console.info("received captcha token...posting faucet request")
    const response = await fetch("api/faucet", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({beneficiary, captchaToken, skipStables, network: 'alfajores'}),
    })
    // TODO get key from result and set
    const result = await response.json() as FaucetAPIResponse
    console.info("faucet request sent...received")
    if (result.status === "Failed") {
      console.warn(result.message)
      setFailureStatus(result.message)
    } else {
      setKey(result.key)
    }

  }, [inputRef, executeRecaptcha, skipStables])

  const onInvalid = useCallback((event: FormEvent<HTMLInputElement>) => {
    const {validity} = event.currentTarget
    if (validity.patternMismatch || validity.badInput || !validity.valid) {
      event.currentTarget.setCustomValidity('enter an 0x address')
    } else {
      event.currentTarget.setCustomValidity('')
    }
  },[])

  const reset = useCallback(() => {
    setFailureStatus(null)
    setKey(null)
  }, [])

  const previousAddress = useLastAddress()
  const buttonDisabled = !executeRecaptcha || !!faucetRequestKey || disableCELOWhenOut


  return <>
    <div className={styles.intro}>
        <p className={`${inter.className} ${styles.center}`}>
          Enter your testnet address below. Authenticate with GitHub to receive more tokens.
        </p>
    </div>
    <form className={styles.center} onSubmit={onSubmit} action="api/faucet" method="post">
      <label className={styles.center}>
        <span className={styles.label}>
          Account Address
        </span>
        <input defaultValue={previousAddress}  onInvalid={onInvalid} minLength={40} ref={inputRef} pattern="^0x[a-fA-F0-9]{40}"  type="text" placeholder="0x01F10..." className={styles.address} />
      </label>
      <button disabled={buttonDisabled} className={styles.button} type="submit">{"Faucet"}</button>
      <label>
        <input onChange={toggleStables} name="token-request" value={"skip-stables"} type={"checkbox"} defaultChecked={skipStables}/>
        <small> CELO Only</small>
      </label>
      <FaucetStatus reset={reset} failureStatus={failureStatus} faucetRequestKey={faucetRequestKey} isExecuting={isExecuting || !!faucetRequestKey} errors={errors} />
    </form>
  </>
}

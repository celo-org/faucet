import { Inter } from '@next/font/google'
import dynamic from 'next/dynamic'
import { FormEvent, useCallback, useRef, useState } from 'react'
import { useGoogleReCaptcha } from 'react-google-recaptcha-v3'
import { useAsyncCallback } from 'react-use-async-callback'
import { FaucetAPIResponse } from 'src/faucet-interfaces'
import styles from 'styles/Form.module.css'
const FaucetStatus = dynamic(() => import('src/faucet-status'), {})
export const inter = Inter({ subsets: ['latin'] })

export default function RequestForm() {

  const inputRef = useRef<HTMLInputElement>(null)

  const { executeRecaptcha } = useGoogleReCaptcha();

  const [faucetRequestKey, setKey] = useState<string | null>(null)
  const [failureStatus, setFailureStatus] = useState<string | null>(null)

  const [onSubmit, {isExecuting, errors, successfullyExecuted}] = useAsyncCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const beneficiary = inputRef.current?.value

    if (!beneficiary?.length || !executeRecaptcha) {
      return
    }
    const captchaToken = await executeRecaptcha('faucet');
    console.info("received captcha token...posting faucet request")
    const response = await fetch("api/faucet", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({beneficiary, captchaToken}),
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

  }, [inputRef])

  const onInvalid = useCallback((event: FormEvent<HTMLInputElement>) => {
    const {validity} = event.currentTarget
    if (validity.patternMismatch || validity.badInput || !validity.valid) {
      event.currentTarget.setCustomValidity('enter an 0x address')
    } else {
      event.currentTarget.setCustomValidity('')
    }
  },[])

  return <form className={styles.center} onSubmit={onSubmit} action="api/faucet" method="post">
      <label className={styles.center}>
        <span className={styles.label}>
          Account Address
        </span>
        <input onInvalid={onInvalid} minLength={40} ref={inputRef} pattern="^0x[a-fA-F0-9]{40}"  type="text" placeholder="0x01F10..." className={styles.address} />
      </label>
      <button disabled={!executeRecaptcha} className={styles.button} type="submit">{"Faucet"}</button>
      <FaucetStatus failureStatus={failureStatus} faucetRequestKey={faucetRequestKey} isExecuting={isExecuting || successfullyExecuted} errors={errors} />
    </form>
}

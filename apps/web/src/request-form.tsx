import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { GoogleReCaptchaProvider } from 'react-google-recaptcha-v3'
import { useAsyncCallback } from 'react-use-async-callback'
import styles from '../styles/Form.module.css'

import { FaucetAPIResponse, RequestRecord } from './faucet-interfaces'

export default function RequestForm() {


  const inputRef = useRef<HTMLInputElement>(null)

  const [faucetRequestKey, setKey] = useState<string | null>(null)

  const [onSubmit, {isExecuting, errors}] = useAsyncCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const beneficiary = inputRef.current?.value

    if (!beneficiary?.length) {
      return
    }

    const response = await  fetch("api/faucet", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({beneficiary}),
    })
    // TODO get key from result and set
    const result = await response.json() as FaucetAPIResponse

    if (result.status === "Failed") {
      throw new Error("Faucet Failed")
    } else {
      setKey(result.key)
    }

  }, [inputRef])

  const onInvalid = (event: FormEvent<HTMLInputElement>) => {
    if (event.currentTarget.validity.patternMismatch || event.currentTarget.validity.badInput) {
      event.currentTarget.setCustomValidity('enter an 0x address')
    } else {
      event.currentTarget.setCustomValidity('')
    }
  }

  return <GoogleReCaptchaProvider reCaptchaKey={process.env.NEXT_PUBLIC_RECAPTCHA_KEY as string}>

    <form className={styles.center} onSubmit={onSubmit} action="api/faucet" method="post">
      <label className={styles.center}>
        <span className={styles.label}>
          Account Address
        </span>
        <input onInvalid={onInvalid} minLength={40} ref={inputRef} pattern="^0x[a-fA-F0-9]{40}"  type="text" placeholder="0x01F10..." className={styles.address} />
      </label>
      <button className={styles.button} type="submit">{"Faucet"}</button>
      <FaucetStatus faucetRequestKey={faucetRequestKey} isExecuting={isExecuting} errors={errors} />
      {/* <GoogleReCaptcha /> */}
    </form>
  </GoogleReCaptchaProvider>
}

interface StatusProps {
  faucetRequestKey: string | null,
  isExecuting: boolean
  errors: any[]
}

function FaucetStatus({faucetRequestKey, isExecuting, errors}: StatusProps) {
    const [faucetRecord, setFaucetRecord] = useState<Partial<RequestRecord>>()

    const onFirebaseUpdate = useCallback(({status, dollarTxHash, goldTxHash}: RequestRecord) => {
      setFaucetRecord({
        status,
        dollarTxHash,
        goldTxHash
      })
  }, [])

  useEffect(() => {
    const run = async function() {
    const subscribe = await import("./firebase-client").then(mod => mod.default)

    if (faucetRequestKey) {
      subscribe(faucetRequestKey, onFirebaseUpdate)
    }
  }
  run()
  }, [faucetRequestKey])



  if (!faucetRecord && !isExecuting) {
    return null
  }



  return <div>
    <h5>Status: {isExecuting ? "Initializing" : faucetRecord?.status}</h5>
    { faucetRecord?.goldTxHash ?
      <a target="_blank" rel="nofollow" href={`https://alfajores.celoscan.io/tx/${faucetRecord.goldTxHash}`}>
        View on CeloScan
      </a>
      : null
    }
  </div>
}

/*
TODO
  recaptcha protection
  add back listening for firebase events
  vercel deployment
  ui feedback
*
*/
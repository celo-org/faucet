import { Inter } from '@next/font/google'
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { useGoogleReCaptcha } from 'react-google-recaptcha-v3'
import { useAsyncCallback } from 'react-use-async-callback'
import { FaucetAPIResponse, RequestRecord } from './faucet-interfaces'
import styles from 'styles/Form.module.css'
const inter = Inter({ subsets: ['latin'] })



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

    const response = await fetch("api/faucet", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({beneficiary, captchaToken}),
    })
    // TODO get key from result and set
    const result = await response.json() as FaucetAPIResponse
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

interface StatusProps {
  faucetRequestKey: string | null,
  isExecuting: boolean
  failureStatus: string |  null
  errors: any[]
}

function FaucetStatus({faucetRequestKey, isExecuting, errors, failureStatus}: StatusProps) {
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
        await subscribe(faucetRequestKey, onFirebaseUpdate)
      }
    }
    void run().catch(console.error)
  }, [faucetRequestKey, onFirebaseUpdate])


  if (!faucetRecord && !isExecuting) {
    return null
  }

  if (errors?.length) {
    console.error("Faucet Error", errors)
  }


  return <div className={styles.center}>
    <h3 className={`${inter.className} ${styles.status}`} aria-live='polite'>Status: {errors?.length || failureStatus?.length ?  "Error" : faucetRecord?.status ?? "Initializing"}</h3>
    { faucetRecord?.goldTxHash ?
      <a className={inter.className} target="_blank" rel="noreferrer" href={`https://alfajores.celoscan.io/tx/${faucetRecord.goldTxHash}`}>
        View on CeloScan
      </a>
      : null
    }
    {failureStatus ? <span className={inter.className} aria-live='polite'>{failureStatus}</span> : null}
  </div>
}

/*
TODO
  vercel deployment
*
*/
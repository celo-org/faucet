import { useCallback, useEffect, useState } from 'react'
import { inter } from './request-form'
import { RequestRecord, RequestStatus } from 'src/faucet-interfaces'
import subscribe from 'src/firebase-client'
import styles from 'styles/Form.module.css'

interface StatusProps {
  faucetRequestKey: string | null
  isExecuting: boolean
  failureStatus: string | null
  errors: any[]
  reset: () => void
}
export default function FaucetStatus({reset, faucetRequestKey, isExecuting, errors, failureStatus }: StatusProps) {
  const [faucetRecord, setFaucetRecord] = useState<Partial<RequestRecord>>()

  const onFirebaseUpdate = useCallback(({ status, dollarTxHash, goldTxHash }: RequestRecord) => {
    setFaucetRecord({
      status,
      dollarTxHash,
      goldTxHash
    })
    if (status === RequestStatus.Done) {
      setTimeout(reset, 2_000)
    }
  }, [reset])

  useEffect(() => {
    const run = async function () {

      if (faucetRequestKey) {
        console.info("subscribing to events...")
        await subscribe(faucetRequestKey, onFirebaseUpdate)
      }
    }
    // eslint-disable-next-line
    run().catch(console.error)
  }, [faucetRequestKey, onFirebaseUpdate])


  if (!faucetRecord && !isExecuting) {
    return null
  }

  if (errors?.length) {
    console.error("Faucet Error", errors)
  }

  return <div className={styles.center}>
    <h3 className={`${inter.className} ${styles.status}`} aria-live='polite'>Status: {errors?.length || failureStatus?.length ? "Error" : faucetRecord?.status ?? "Initializing"}</h3>
    {faucetRecord?.goldTxHash ?
      faucetRecord.goldTxHash === 'skipped' ? <span className={inter.className}>
        No celo was transferred as the account already has a large celo balance.
      </span> :
      <a className={inter.className} target="_blank" rel="noreferrer" href={`https://alfajores.celoscan.io/tx/${faucetRecord.goldTxHash}`}>
        View on CeloScan
      </a>
      : null}
    {failureStatus ? <span className={inter.className} aria-live='polite'>{failureStatus}</span> : null}
  </div>
}

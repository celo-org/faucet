import { FC, useCallback, useEffect, useState } from 'react'
import { inter } from 'components/request-form'
import { TxMessage } from 'components/TxMessage'
import styles from 'styles/Form.module.css'
import { Network, RequestRecord, RequestStatus } from 'types'
import { subscribeRequest } from 'utils/firebase.client'

interface StatusProps {
  faucetRequestKey: string | null
  isExecuting: boolean
  failureStatus: string | null
  errors: any[]
  reset: () => void
  network: Network
}
export const FaucetStatus: FC<StatusProps> = ({
  reset,
  faucetRequestKey,
  isExecuting,
  errors,
  failureStatus,
  network,
}: StatusProps) => {
  const [faucetRecord, setFaucetRecord] = useState<Partial<RequestRecord>>()

  const onFirebaseUpdate = useCallback(
    ({ status, dollarTxHash, goldTxHash }: RequestRecord) => {
      setFaucetRecord({
        status,
        dollarTxHash,
        goldTxHash,
      })
      if (status === RequestStatus.Done) {
        setTimeout(reset, 2_000)
      }
    },
    [reset],
  )

  useEffect(() => {
    const run = async function () {
      if (faucetRequestKey) {
        console.info('subscribing to events...')
        await subscribeRequest(faucetRequestKey, onFirebaseUpdate, network)
      }
    }
    // eslint-disable-next-line
    run().catch(console.error)
  }, [faucetRequestKey, onFirebaseUpdate, network])

  if (!faucetRecord && !isExecuting) {
    return null
  }

  if (errors?.length) {
    console.error('Faucet Error', errors)
  }

  return (
    <div className={styles.center}>
      <h3 className={`${inter.className} ${styles.status}`} aria-live="polite">
        Status:{' '}
        {errors?.length || failureStatus?.length
          ? 'Error'
          : (faucetRecord?.status ?? 'Initializing')}
      </h3>
      <TxMessage txHash={faucetRecord?.goldTxHash} network={network} />
      {failureStatus ? (
        <span className={inter.className} aria-live="polite">
          {failureStatus}
        </span>
      ) : null}
    </div>
  )
}



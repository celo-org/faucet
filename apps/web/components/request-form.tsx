import { useSession } from 'next-auth/react'
import dynamic from 'next/dynamic'
import { Inter } from 'next/font/google'
import { FC, FormEvent, useCallback, useRef, useState } from 'react'
import { useGoogleReCaptcha } from 'react-google-recaptcha-v3'
import { useAsyncCallback } from 'react-use-async-callback'
import styles from 'styles/Form.module.css'
import { FaucetAPIResponse, Network } from 'types'
import { saveAddress } from 'utils/history'
import { useLastAddress } from 'utils/useLastAddress'
import { Button } from '../@/components/ui/button'
import { Input } from '../@/components/ui/input'
import { Label } from '../@/components/ui/label'

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

  const { executeRecaptcha } = useGoogleReCaptcha()

  const previousAddress = useLastAddress()
  const [address, setAddress] = useState<string | undefined>(previousAddress)
  const [faucetRequestKey, setKey] = useState<string | null>(null)
  const [failureStatus, setFailureStatus] = useState<string | null>(null)

  const disableCELOWhenOut = isOutOfCELO

  const [onSubmit, { isExecuting, errors }] = useAsyncCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()

      const beneficiary = address
      console.info('begin faucet sequence')
      if (!beneficiary?.length || !executeRecaptcha) {
        console.info('aborting')
        return
      }
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
    [address, executeRecaptcha],
  )

  const onInvalid = useCallback((event: FormEvent<HTMLInputElement>) => {
    const { validity } = event.currentTarget
    console.log(event.currentTarget.validity, event.currentTarget.value)
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

  const buttonDisabled =
    !executeRecaptcha ||
    !!faucetRequestKey ||
    disableCELOWhenOut ||
    !address ||
    isExecuting

  return (
    <form
      className={styles.center}
      onSubmit={onSubmit}
      action="api/faucet"
      method="post"
    >
      <div className="flex gap-4 flex-col w-full">
        <Label htmlFor="address">Account Address</Label>
        <Input
          id="address"
          onInvalid={onInvalid}
          minLength={40}
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          pattern="^0x[a-fA-F0-9]{40}"
          type="text"
          placeholder="0x01F10..."
          className={styles.address}
        />
        <Button disabled={buttonDisabled} type="submit" className="self-center">
          Claim CELO
        </Button>
      </div>

      <FaucetStatus
        network={network}
        reset={reset}
        failureStatus={failureStatus}
        faucetRequestKey={faucetRequestKey}
        isExecuting={isExecuting || !!faucetRequestKey}
        errors={errors}
      />
    </form>
  )
}

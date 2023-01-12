import { FormEvent, useCallback, useRef, useState } from 'react'
import styles from '../styles/Form.module.css'

export default function RequestForm() {

  const inputRef = useRef<HTMLInputElement>(null)

  const [submitted, setSubmited] = useState(false)

  const onSubmit = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const beneficiary = inputRef.current?.value

    if (beneficiary?.length) {

      fetch("api/faucet", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({beneficiary}),
      }).then(() => setSubmited(true))
    }
  }, [])

  const onInvalid = (event: FormEvent<HTMLInputElement>) => {
    if (event.currentTarget.validity.patternMismatch || event.currentTarget.validity.badInput) {
      event.currentTarget.setCustomValidity('enter an 0x address')
    } else {
      event.currentTarget.setCustomValidity('')
    }
  }

  return <form className={styles.center} onSubmit={onSubmit} action="api/faucet" method="post">
    <label className={styles.center}>
      <span className={styles.label}>
        Account Address
      </span>
      <input onInvalid={onInvalid} minLength={40} ref={inputRef} pattern="^0x[a-fA-F0-9]{40}"  type="text" placeholder="0x01F10..." className={styles.address} />
    </label>
    <button className={styles.button} type="submit">{submitted? "Fauceted": "Faucet"}</button>
  </form>
}


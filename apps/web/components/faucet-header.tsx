import { ConnectButton } from '@rainbow-me/rainbowkit'
import { FC } from 'react'
import { Logo } from 'components/logo'
import styles from 'styles/FaucetHeader.module.css'

export const FaucetHeader: FC = ({}) => (
  <div className={styles.top}>
    <div className={styles.topBar}>
      <div className={styles.logo}>
        <Logo />
      </div>
      <div className={styles.connectButton}>
        <ConnectButton />
      </div>
    </div>
  </div>
)

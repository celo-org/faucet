import React, { FC } from 'react'
import { Network } from 'types'
import styles from 'styles/FaucetHeader.module.css'
import { Logo } from 'components/logo'
import { GitHubAuth } from 'components/github-auth'

interface Props {
  network: Network
  isOutOfCELO: boolean
}

export const FaucetHeader: FC<Props> = ({ network, isOutOfCELO }) => (
  <div className={styles.top}>
    {isOutOfCELO && (
      <header className={styles.notice}>
        <span>The Faucet is out of CELO for now.</span>
        {network === 'alfajores' && (
          <>
            {' '}
            It will be topped up{' '}
            <a
              target="_blank"
              rel="noreferrer"
              href="https://explorer.celo.org/alfajores/epochs"
            >
              within an hour
            </a>
          </>
        )}
      </header>
    )}
    <div className={styles.topBar}>
      <div className={styles.logo}>
        <Logo />
      </div>
      <GitHubAuth />
    </div>
  </div>
)

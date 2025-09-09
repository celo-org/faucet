import { GitHubAuth } from 'components/github-auth'
import { Logo } from 'components/logo'
import { ModeToggle } from 'components/mode-toggle'
import { FC } from 'react'
import styles from 'styles/FaucetHeader.module.css'
import { Network } from 'types'

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
    <div className={`${styles.topBar}`}>
      <div className={`${styles.logo} dark:filter-[invert(1)]`}>
        <Logo />
      </div>
      <div className="flex flex-row items-end gap-3 pr-[40px]">
        <GitHubAuth />
        <ModeToggle />
      </div>
    </div>
  </div>
)

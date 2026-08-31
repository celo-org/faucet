import Link from 'next/link'
import { FC } from 'react'
import { GitHubAuth } from 'components/github-auth'
import { Logo } from 'components/logo'
import { ModeToggle } from 'components/mode-toggle'
import styles from 'styles/FaucetHeader.module.css'
import { Network } from 'types'
import { inter } from 'utils/inter'

interface Props {
  network: Network
  isOutOfCELO: boolean
}

export const FaucetHeader: FC<Props> = ({ network, isOutOfCELO }) => (
  <div className={styles.top}>
    {isOutOfCELO && (
      <header className={styles.notice}>
        <span>The Faucet is out of CELO for now.</span>
      </header>
    )}
    <div className={`${styles.topBar}`}>
      {/*
        The logo was inert on every page, so /keys, /signin and /auth-error
        had no way back to the faucet at all.
      */}
      {/*
        Uses the network it was handed rather than a constant: pages that are
        not network-scoped pass celo-sepolia explicitly, and a second chain
        would otherwise send its own logo to the wrong faucet.
      */}
      <Link
        href={`/${network}`}
        aria-label="Celo faucet home"
        className={`${styles.logo} dark:filter-[invert(1)]`}
      >
        <Logo />
      </Link>
      <div className="flex flex-row items-center gap-3 pr-[40px]">
        <Link
          href="/keys"
          className={`${inter.className} text-sm underline underline-offset-4`}
        >
          For Agents
        </Link>
        <GitHubAuth />
        <ModeToggle />
      </div>
    </div>
  </div>
)

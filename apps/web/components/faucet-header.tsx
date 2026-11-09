import Link from 'next/link'
import { useRouter } from 'next/router'
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

/**
 * The two pages a visitor moves between. /keys used to offer only the logo as
 * a way back, so "Faucet" sits next to "For Agents" and the current page is
 * marked with aria-current rather than by colour alone.
 */
const navLinkClass = `${inter.className} ${styles.navLink}`

export const FaucetHeader: FC<Props> = ({ network, isOutOfCELO }) => {
  const { pathname } = useRouter()
  const onFaucet = pathname === '/[chain]'
  const onKeys = pathname === '/keys'

  return (
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

        <nav aria-label="Main" className={styles.nav}>
          <Link
            href={`/${network}`}
            className={navLinkClass}
            aria-current={onFaucet ? 'page' : undefined}
          >
            Faucet
          </Link>
          <Link
            href="/keys"
            className={navLinkClass}
            aria-current={onKeys ? 'page' : undefined}
          >
            For Agents
          </Link>
        </nav>
        <div className="flex flex-row items-center gap-3 pr-3 sm:pr-[40px]">
          <GitHubAuth />
          <ModeToggle />
        </div>
      </div>
    </div>
  )
}

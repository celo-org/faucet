import { GetServerSideProps, NextPage } from 'next'
import Head from 'next/head'
import Link from 'next/link'
import { FaucetHeader } from 'components/faucet-header'
import { RequestForm } from 'components/request-form'
import { SetupButton } from 'components/setup-button'
import styles from 'styles/Home.module.css'
import { Network, networks } from 'types'
import { inter } from 'utils/inter'

interface Props {
  isOutOfCELO: boolean
  network: Network
}

const Home: NextPage<Props> = ({ isOutOfCELO, network }: Props) => {
  const networkCapitalized = capitalize(network)

  const otherNetwork =
    networks.indexOf(network) === 0 ? networks[1] : networks[0]
  return (
    <>
      <Head>
        <title>Fund Your Testnet Account</title>
        <meta
          name="description"
          content={`Get Your ${networkCapitalized} Address Funded`}
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main className={styles.main}>
        <FaucetHeader network={network} isOutOfCELO={isOutOfCELO} />
        <div className={styles.container}>
          <header className={`${inter.className} ${styles.center}`}>
            <h1 className={`${inter.className} ${styles.title}`}>
              {networkCapitalized} Token Faucet
            </h1>
            {networks.length > 1 && (
              <Link className={styles.switchNetwork} href={`/${otherNetwork}`}>
                Switch to {capitalize(otherNetwork)}
              </Link>
            )}
          </header>
          <div className={styles.center}>
            <RequestForm network={network} isOutOfCELO={isOutOfCELO} />
          </div>

          <small className={`${styles.phaseDown} ${inter.className}`}>
            Need <b>USDC</b>? Get tokens at{' '}
            <u>
              <Link href="https://faucet.circle.com/">faucet.circle.com</Link>
            </u>
          </small>

          <small className={`${styles.phaseDown} ${inter.className}`}>
            *Accounts with large balances will receive a phased down amount.
            Please consider returning any tokens you won&#39;t need.
          </small>
        </div>
        <footer className={styles.grid}>
          <SetupButton network={network} />

          <a
            href="https://docs.celo.org"
            className={styles.card}
            target="_blank"
            tabIndex={0}
            rel="noopener noreferrer"
          >
            <h3 className={inter.className}>
              Read Celo Docs <span>&gt;</span>
            </h3>
            <p className={inter.className}>
              Find in-depth information about the Celo blockchain
            </p>
          </a>

          <a
            href="https://chat.celo.org"
            className={styles.card}
            target="_blank"
            tabIndex={0}
            rel="noopener noreferrer"
          >
            <h3 className={inter.className}>
              Ask Questions <span>&gt;</span>
            </h3>
            <p className={inter.className}>
              Chat with Celo Community on Discord
            </p>
          </a>

          <a
            href="https://docs.google.com/forms/d/1n6m-nMjjDn2RpBDadMMqYpf5DzDTOeRk1dhDJrLFdO4/viewform"
            className={styles.card}
            target="_blank"
            tabIndex={0}
            rel="noopener noreferrer"
          >
            <h3 className={inter.className}>
              Have Advanced Needs? <span>&gt;</span>
            </h3>
            <p className={inter.className}>
              Request a larger amount of tokens for your testing needs.
            </p>
          </a>
        </footer>
      </main>
    </>
  )
}

function capitalize(word: string) {
  return `${word[0].toUpperCase()}${word.slice(1).toLowerCase()}`
}

export default Home

export const getServerSideProps: GetServerSideProps<Props> = async (
  context,
) => {
  const network = context.query.chain
  if (typeof network !== 'string' || !networks.includes(network)) {
    return {
      notFound: true,
    }
  }

  // const isOutOfCELO = await isBalanceBelowPar(network as Network)
  return {
    props: { isOutOfCELO: false, network: network as Network },
  }
}

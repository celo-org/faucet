import { NextPage, GetServerSideProps } from 'next'
import Head from 'next/head'
import { isBalanceBelowPar } from 'src/balance'
import Logo from 'src/logo'
import RequestForm from 'src/request-form'
import { GitHubAuth } from 'src/github-auth'
import { SetupButton } from 'src/setup-button'
import styles from 'styles/Home.module.css'
import { networks, Network } from 'src/faucet-interfaces'
import { inter } from 'src/inter'

interface Props {
  isOutOfCELO: boolean
  network: Network
}

const Home: NextPage<Props> = ({ isOutOfCELO, network }: Props) => {
  const networkCapitalized = `${network[0].toUpperCase()}${network
    .slice(1)
    .toLowerCase()}`
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
        <div className={styles.top}>
          {isOutOfCELO && network === 'alfajores' && (
            <header className={styles.notice}>
              The Faucet is out of CELO for now. It will be topped up{' '}
              <a
                target="_blank"
                rel="noreferrer"
                href="https://explorer.celo.org/alfajores/epochs"
              >
                within an hour
              </a>
            </header>
          )}
          <div className={styles.topBar}>
            <div className={styles.logo}>
              <Logo />
            </div>
            <GitHubAuth />
          </div>
        </div>
        <div className={styles.container}>
          <header className={styles.center}>
            <h1 className={`${inter.className} ${styles.title}`}>
              {networkCapitalized} Token Faucet
            </h1>
          </header>
          <div className={styles.center}>
            <RequestForm network={network} isOutOfCELO={isOutOfCELO} />
          </div>
          <small>
            *Accounts with large balances will received a phased down amount.
            Please consider sending back any tokens you wont need.
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

export default Home

export const getServerSideProps: GetServerSideProps<Props> = async (
  context
) => {
  const network = context.query.chain
  if (typeof network !== 'string' || !networks.includes(network)) {
    return {
      notFound: true,
    }
  }

  const isOutOfCELO = await isBalanceBelowPar(network as Network)
  return {
    props: { isOutOfCELO, network: network as Network },
  }
}

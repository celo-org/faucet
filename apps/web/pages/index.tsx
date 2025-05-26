import { NextPage } from 'next'
import Head from 'next/head'
import Link from 'next/link'
import { useChainId, useSwitchChain } from 'wagmi'
import { FaucetHeader } from 'components/faucet-header'
import { RequestForm } from 'components/request-form'
import styles from 'styles/Home.module.css'
import { inter } from 'utils/inter'

const Home: NextPage = () => {
  const chainId = useChainId()
  const { chains, switchChain } = useSwitchChain()

  const chain = chains.find((c) => c.id === chainId)

  const networkCapitalized = capitalize(chain?.name || 'Unknown Network')

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
        <FaucetHeader />
        <div className={styles.container}>
          <header className={`${inter.className} ${styles.center}`}>
            <h1 className={`${inter.className} ${styles.title}`}>
              {networkCapitalized} Token Faucet
            </h1>
            {chains.length > 1 &&
              chains.map((c) => (
                <Link
                  key={c.id}
                  className={styles.switchNetwork}
                  href="#"
                  onClick={() => switchChain?.({ chainId: c.id })}
                >
                  Switch to {capitalize(c.name)}
                </Link>
              ))}
          </header>
          <div className={styles.center}>
            <RequestForm />
          </div>

          <small className={`${styles.phaseDown} ${inter.className}`}>
            Need <b>USDC</b>? Get tokens at{' '}
            <u>
              <Link href="https://faucet.circle.com/">faucet.circle.com</Link>
            </u>
          </small>

          <small className={`${styles.phaseDown} ${inter.className}`}>
            Swap CELO for cUSD, cEUR, or cREAL on{' '}
            <u>
              <Link href="https://app.mento.org/">mento</Link>
            </u>{' '}
            . For other tokens like USDT or USDC, swap CELO to cUSD first, then
            exchange to your desired token.
          </small>
        </div>
        <footer className={styles.grid}>
          {/* <SetupButton /> */}

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

          {/* <a
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
          </a> */}
        </footer>
      </main>
    </>
  )
}

function capitalize(word: string) {
  return `${word[0].toUpperCase()}${word.slice(1).toLowerCase()}`
}

export default Home

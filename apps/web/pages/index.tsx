import { Inter } from '@next/font/google'
import Head from 'next/head'
import Logo from 'src/logo'
import RequestForm from 'src/request-form'
import { SetupButton } from 'src/setup-button'
import styles from 'styles/Home.module.css'
export const inter = Inter({ subsets: ['latin'] })

export default function Home() {

  return (
    <>
      <Head>
        <title>Fund Your Testnet Account</title>
        <meta name="description" content="Get Your Alfajores Address Funded" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main className={styles.main}>
        <div className={styles.container}>
          <div className={styles.logo}>
            <Logo />
          </div>
          <header className={styles.center}>
            <h1 className={`${inter.className} ${styles.title}`}>Alfajores Token Faucet</h1>
          </header>
          <div className={styles.intro}>
            <p className={`${inter.className} ${styles.center}`}>
              Enter your testnet address below. Each request gives you: 5 CELO, 5 cUSD, 5 cEUR, & 5 cREAL*.
            </p>
          </div>
          <div className={styles.center}>
            <RequestForm />
          </div>
          <small>*Accounts with large balances will received a phased down amount. Please consider sending back any tokens you wont need.</small>
        </div>
        <footer className={styles.grid}>

          <SetupButton />

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

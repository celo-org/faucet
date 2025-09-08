import { Card } from '@/components/ui/card'
import { FaucetHeader } from 'components/faucet-header'
import { RequestForm } from 'components/request-form'
import { SetupButton } from 'components/setup-button'
import { GetServerSideProps, NextPage } from 'next'
import Head from 'next/head'
import Link from 'next/link'
import styles from 'styles/Home.module.css'
import { Network, networks } from 'types'
import { isBalanceBelowPar } from 'utils/balance'
import { capitalize } from 'utils/capitalize'
import { inter } from 'utils/inter'
import {
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../@/components/ui/card'

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
        <Card className="w-full max-w-sm items-stretch">
          <CardHeader>
            <CardTitle>{networkCapitalized} Token Faucet</CardTitle>
            <CardDescription>
              {networks.length > 1 && (
                <Link
                  className={styles.switchNetwork}
                  href={`/${otherNetwork}`}
                >
                  Switch to {capitalize(otherNetwork)}
                </Link>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RequestForm network={network} isOutOfCELO={isOutOfCELO} />
          </CardContent>
          <CardFooter className="flex-col gap-2">
            <div className="mt-4 text-sm">
              <small className={`${styles.phaseDown} ${inter.className}`}>
                Need <b>USDC</b>? Get tokens at{' '}
                <u>
                  <a
                    href="https://faucet.circle.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    faucet.circle.com
                  </a>
                </u>
              </small>
              <br />
              <small className={`${styles.phaseDown} ${inter.className}`}>
                Swap CELO for cUSD, cEUR, or cREAL, or USDC on{' '}
                <u>
                  <Link href="https://app.mento.org/">mento</Link>
                </u>{' '}
              </small>
              {network === 'celo-sepolia' && (
                <small className={`${styles.phaseDown} ${inter.className}`}>
                  Alternative faucet{' '}
                  <u>
                    <Link href="https://cloud.google.com/application/web3/faucet/celo/sepolia">
                      by Google
                    </Link>
                  </u>{' '}
                </small>
              )}
            </div>
          </CardFooter>
        </Card>

        <footer className={styles.grid}>
          <Card className={styles.card}>
            <h3 className={inter.className}>Faucet rules</h3>
            <div className="flex flex-col gap-1">
              <p className={inter.className}>
                &bull; You are considered <i>authenticated</i> if you either
                sign-in with GitHub, own 0.01 ETH on eth-mainnet, or own 100
                LockedCelo on celo-mainnet
              </p>
              <p className={inter.className}>
                &bull; You may faucet 4 times a day if <i>unauthenticated</i>.
              </p>
              <p className={inter.className}>
                &bull; You may faucet 10 times a day if <i>authenticated</i>,
                for 10 times the amount of unauthenticated requests.
              </p>
            </div>
          </Card>
          <Card className={styles.card}>
            <SetupButton network={network} />
          </Card>

          <Card className={styles.card}>
            <a
              href="https://docs.celo.org"
              target="_blank"
              tabIndex={0}
              rel="noopener noreferrer"
            >
              <h3 className={inter.className}>
                Read Celo Docs <span>→</span>
              </h3>
              <p className={inter.className}>
                Find in-depth information about the Celo blockchain
              </p>
            </a>
          </Card>
          <Card className={styles.card}>
            <a
              href="https://chat.celo.org"
              target="_blank"
              tabIndex={0}
              rel="noopener noreferrer"
            >
              <h3 className={inter.className}>
                Ask Questions <span>→</span>
              </h3>
              <p className={inter.className}>
                Chat with Celo Community on Discord
              </p>
            </a>
          </Card>

          <Card className={styles.card}>
            <a
              href="https://docs.google.com/forms/d/1n6m-nMjjDn2RpBDadMMqYpf5DzDTOeRk1dhDJrLFdO4/viewform"
              target="_blank"
              tabIndex={0}
              rel="noopener noreferrer"
            >
              <h3 className={inter.className}>
                Have Advanced Needs? <span>→</span>
              </h3>
              <p className={inter.className}>
                Request a larger amount of tokens for your testing needs.
              </p>
            </a>
          </Card>
        </footer>
      </main>
    </>
  )
}

export default Home

export const getServerSideProps: GetServerSideProps<Props> = async (
  context,
) => {
  const network = context.query.chain
  if (typeof network !== 'string' || !networks.includes(network as Network)) {
    return {
      notFound: true,
    }
  }

  const isOutOfCELO = await isBalanceBelowPar(network as Network)
  return {
    props: { isOutOfCELO, network: network as Network },
  }
}

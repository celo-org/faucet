import { GetServerSideProps, NextPage } from 'next'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { CardContent, CardFooter, CardHeader } from '../@/components/ui/card'
import { Card } from '@/components/ui/card'
import { FaucetHeader } from 'components/faucet-header'
import { JsonLd } from 'components/json-ld'
import { RequestForm } from 'components/request-form'
import { Seo } from 'components/seo'
import { SetupButton } from 'components/setup-button'
import { DRIP_AMOUNTS } from 'config/chains'
import { DAILY_REQUESTS, SITE_URL } from 'config/site'
import styles from 'styles/Home.module.css'
import { ChainId, Network, networks } from 'types'
import { isBalanceBelowPar } from 'utils/balance'
import { capitalize } from 'utils/capitalize'
import { inter } from 'utils/inter'

interface Props {
  isOutOfCELO: boolean
  network: Network
}

const Home: NextPage<Props> = ({ isOutOfCELO, network }: Props) => {
  const networkCapitalized = capitalize(network)
  const { data: session } = useSession()
  const drip = DRIP_AMOUNTS[network]

  /**
   * Written as questions and answers, and rendered as prose rather than as
   * interface labels, because the facts below used to exist only as bullet
   * fragments attached to the form. Asked how much CELO the faucet sends, a
   * retrieval system had nothing on this domain to quote and fell back to
   * third-party blog posts.
   *
   * The same array feeds the FAQPage structured data, so the answer a model
   * reads and the answer a visitor reads cannot drift apart.
   */
  const faqs = [
    {
      question: `How do I get ${networkCapitalized} testnet tokens?`,
      answer: `Paste the address you want funded into the form on this page and submit it. The faucet sends ${drip.unauthenticated} CELO. Signing in with GitHub raises that to ${drip.authenticated} CELO and raises your allowance from ${DAILY_REQUESTS.unauthenticated} to ${DAILY_REQUESTS.authenticated} requests a day.`,
    },
    {
      question: 'How much CELO does each request send?',
      answer: `${drip.unauthenticated} CELO for an unauthenticated request and ${drip.authenticated} CELO for an authenticated one. Only the native CELO token is dispensed; for USDC use faucet.circle.com, and for Mento stablecoins swap CELO at app.mento.org.`,
    },
    {
      question: 'Does the Celo faucet have an API?',
      answer: `Yes. POST to ${SITE_URL}/api/faucet with a beneficiary address and a network, then poll ${SITE_URL}/api/status with the request key it returns to get the transaction hash. The schema is published at ${SITE_URL}/openapi.json.`,
    },
    {
      question: 'How can an AI agent or a script get testnet CELO?',
      answer:
        'The browser flow is gated on reCAPTCHA v3, which scores headless callers badly and cannot be solved without driving a real browser. Create an API key instead and send it as a bearer token, which skips the captcha. A key changes how you prove who you are, not how much you can request.',
    },
  ]

  return (
    <>
      <Seo
        title={`${networkCapitalized} Faucet — Get Free Testnet CELO`}
        description={`Get ${drip.unauthenticated} CELO per request on ${networkCapitalized}, or ${drip.authenticated} CELO signed in with GitHub. A free testnet faucet with an HTTP API for scripts and AI agents.`}
        path={`/${network}`}
      />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'WebSite',
              '@id': `${SITE_URL}/#website`,
              name: 'Celo Faucet',
              url: SITE_URL,
              description: `A faucet for free testnet CELO on ${networkCapitalized}, chain ID ${ChainId[network]}.`,
            },
            {
              '@type': 'FAQPage',
              '@id': `${SITE_URL}/${network}#faq`,
              mainEntity: faqs.map((faq) => ({
                '@type': 'Question',
                name: faq.question,
                acceptedAnswer: { '@type': 'Answer', text: faq.answer },
              })),
            },
            {
              '@type': 'HowTo',
              '@id': `${SITE_URL}/${network}#howto`,
              name: `Get free testnet CELO on ${networkCapitalized}`,
              totalTime: 'PT1M',
              step: [
                {
                  '@type': 'HowToStep',
                  name: 'Enter the address',
                  text: 'Paste the account address you want funded into the faucet form.',
                },
                {
                  '@type': 'HowToStep',
                  name: 'Sign in for more',
                  text: `Optionally sign in with GitHub to receive ${drip.authenticated} CELO instead of ${drip.unauthenticated} CELO.`,
                },
                {
                  '@type': 'HowToStep',
                  name: 'Claim',
                  text: 'Submit the form. The payout is queued and settles in a few seconds.',
                },
              ],
            },
          ],
        }}
      />
      <main className={styles.main}>
        <FaucetHeader network={network} isOutOfCELO={isOutOfCELO} />
        <Card className="w-full max-w-sm items-stretch">
          <CardHeader>
            {/*
              A real h1 rather than CardTitle: that renders a div, so both
              pages shipped with no h1 or h2 at all and the only ranked
              headings were the footer link cards.
            */}
            <h1 className="font-heading leading-none">
              {networkCapitalized} Token Faucet
            </h1>
          </CardHeader>
          <CardContent>
            <RequestForm network={network} isOutOfCELO={isOutOfCELO} />
          </CardContent>
          <CardFooter className="flex-col gap-2">
            <div className="mt-4 text-sm flex flex-col gap-0.5 items-start">
              {!session && (
                <>
                  <small className={inter.className}>
                    &bull; You get {drip.unauthenticated} CELO. To receive{' '}
                    <b>{drip.authenticated} CELO</b>,{' '}
                    <Link className="underline" href="/api/auth/signin/github">
                      authenticate with GitHub
                    </Link>
                  </small>
                </>
              )}
              <small className={inter.className}>
                &bull; Scripting or building an agent?{' '}
                <Link className="underline" href="/keys">
                  Create an API key
                </Link>{' '}
                to skip the captcha
              </small>
              <small className={inter.className}>
                &bull; Need <b>USDC</b>? Get tokens at{' '}
                <Link className="underline" href="https://faucet.circle.com/">
                  faucet.circle.com
                </Link>
              </small>
              <small className={inter.className}>
                &bull;{' '}
                <Link className="underline" href="https://app.mento.org/">
                  Swap CELO for Mento Tokens
                </Link>
              </small>
              {network === 'celo-sepolia' && (
                <small className={inter.className}>
                  &bull; Alternative faucet{' '}
                  <Link
                    className="underline"
                    href="https://cloud.google.com/application/web3/faucet/celo/sepolia"
                  >
                    by Google
                  </Link>
                </small>
              )}
            </div>
          </CardFooter>
        </Card>

        <footer className={styles.grid}>
          <Card className={styles.card}>
            <h2 className={inter.className}>Faucet rules</h2>
            <div className="flex flex-col gap-1">
              <p className={inter.className}>
                &bull; An unauthenticated request sends {drip.unauthenticated}{' '}
                CELO. An authenticated one sends {drip.authenticated} CELO.
              </p>
              <p className={inter.className}>
                &bull; You are considered <i>authenticated</i> if you either
                sign-in with GitHub, own 0.01 ETH on eth-mainnet, or own 100
                LockedCelo on celo-mainnet
              </p>
              <p className={inter.className}>
                &bull; You may faucet {DAILY_REQUESTS.unauthenticated} times a
                day if <i>unauthenticated</i>.
              </p>
              <p className={inter.className}>
                &bull; You may faucet {DAILY_REQUESTS.authenticated} times a day
                if <i>authenticated</i>, for {drip.authenticated} CELO a time.
              </p>
              <p className={inter.className}>
                &bull; Requests made with an{' '}
                <Link className="underline" href="/keys">
                  API key
                </Link>{' '}
                skip the captcha and draw from the same daily allowance as your
                GitHub sign-in.
              </p>
            </div>
          </Card>
          <Card className={styles.card}>
            <SetupButton network={network} />
          </Card>

          {faqs.map((faq) => (
            <Card className={styles.card} key={faq.question}>
              <h2 className={inter.className}>{faq.question}</h2>
              <p className={inter.className}>{faq.answer}</p>
            </Card>
          ))}

          <Card className={styles.card}>
            <a
              href="https://docs.celo.org"
              target="_blank"
              tabIndex={0}
              rel="noopener noreferrer"
            >
              <h2 className={inter.className}>
                Read Celo Docs <span>→</span>
              </h2>
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
              <h2 className={inter.className}>
                Ask Questions <span>→</span>
              </h2>
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
              <h2 className={inter.className}>
                Have Advanced Needs? <span>→</span>
              </h2>
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

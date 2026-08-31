import { NextPage } from 'next'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../@/components/ui/card'
import { FaucetHeader } from 'components/faucet-header'
import styles from 'styles/Home.module.css'
import { inter } from 'utils/inter'

/**
 * next-auth's built-in error page says only "Try signing in with a different
 * account", which is misleading when the cause is server-side — the visitor
 * changes account, fails again, and has no way to tell it was never their
 * fault. These messages say who can fix it.
 */
const MESSAGES: Record<string, { title: string; detail: string }> = {
  Configuration: {
    title: 'The faucet is misconfigured',
    detail:
      'Sign-in cannot complete because of a server-side setting. Nothing you do differently will help — please report this.',
  },
  OAuthCallback: {
    title: 'GitHub sign-in could not be completed',
    detail:
      'GitHub sent us back but the response was rejected. This is a problem on the faucet side, not with your account.',
  },
  OAuthSignin: {
    title: 'Could not reach GitHub',
    detail:
      'The faucet failed to start the GitHub sign-in. This is usually temporary — try again in a moment.',
  },
  OAuthAccountNotLinked: {
    title: 'That account is already linked elsewhere',
    detail: 'Sign in with the same GitHub account you used the first time.',
  },
  AccessDenied: {
    title: 'GitHub access was declined',
    detail:
      'You cancelled the authorisation, or GitHub refused it. Try again and approve the request.',
  },
  Verification: {
    title: 'That sign-in link has expired',
    detail: 'Request a new one and use it straight away.',
  },
  SessionRequired: {
    title: 'You need to be signed in',
    detail: 'Sign in with GitHub to continue.',
  },
}

const FALLBACK = {
  title: 'Sign-in failed',
  detail:
    'Something went wrong while signing in. If it keeps happening it is likely a problem on the faucet side rather than with your account.',
}

const AuthError: NextPage = () => {
  const { query } = useRouter()
  const code = typeof query.error === 'string' ? query.error : undefined
  const { title, detail } = (code && MESSAGES[code]) || FALLBACK

  return (
    <>
      <Head>
        <title>Sign-in problem</title>
        <meta name="robots" content="noindex" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main className={styles.main}>
        <FaucetHeader network="celo-sepolia" isOutOfCELO={false} />

        <Card className="w-full max-w-lg items-stretch">
          <CardHeader>
            <CardTitle>{title}</CardTitle>
          </CardHeader>

          <CardContent className="flex flex-col gap-4">
            <p className={`${inter.className} text-sm`} role="alert">
              {detail}
            </p>

            <div className="flex flex-col gap-0.5 items-start text-sm">
              <small className={inter.className}>
                &bull;{' '}
                <Link className="underline" href="/api/auth/signin/github">
                  Try signing in again
                </Link>
              </small>
              <small className={inter.className}>
                &bull;{' '}
                <Link className="underline" href="/celo-sepolia">
                  Use the faucet without signing in
                </Link>{' '}
                — you still get tokens, just a smaller amount
              </small>
              <small className={inter.className}>
                &bull;{' '}
                <Link
                  className="underline"
                  href="https://github.com/celo-org/faucet/issues/new/choose"
                >
                  Report this
                </Link>
                {code ? (
                  <>
                    {' '}
                    and quote <code>{code}</code>
                  </>
                ) : null}
              </small>
            </div>
          </CardContent>
        </Card>
      </main>
    </>
  )
}

export default AuthError

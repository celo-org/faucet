import { GetServerSideProps, NextPage } from 'next'
import { signIn } from 'next-auth/react'
import Head from 'next/head'
import Link from 'next/link'
import { Button } from '../@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../@/components/ui/card'
import { FaucetHeader } from 'components/faucet-header'
import styles from 'styles/Home.module.css'
import { authErrorCopy } from 'utils/auth-errors'
import { inter } from 'utils/inter'

/**
 * Custom sign-in page.
 *
 * This exists to surface failures. next-auth routes most error codes —
 * including OAuthCallback and Callback — back to the *sign-in* page rather
 * than to `pages.error` (`core/index.js`, the `case "error"` allowlist), and
 * forwards the code as `?error=`. So the sign-in page is the only place those
 * failures can be explained.
 */
interface Props {
  error: string | null
  callbackUrl: string
}

const SignIn: NextPage<Props> = ({ error, callbackUrl }) => {
  const problem = authErrorCopy(error)

  return (
    <>
      <Head>
        <title>Sign in</title>
        <meta name="robots" content="noindex" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main className={styles.main}>
        <FaucetHeader network="celo-sepolia" isOutOfCELO={false} />

        <Card className="w-full max-w-lg items-stretch">
          <CardHeader>
            <CardTitle>{problem ? problem.title : 'Sign in'}</CardTitle>
          </CardHeader>

          <CardContent className="flex flex-col gap-4">
            {problem ? (
              <p className={`${inter.className} text-sm`} role="alert">
                {problem.detail}
              </p>
            ) : (
              <p className={`${inter.className} text-sm`}>
                Signing in with GitHub raises your faucet allowance and lets you
                create API keys. It is optional.
              </p>
            )}

            <Button
              type="button"
              onClick={() => signIn('github', { callbackUrl })}
            >
              Sign in with GitHub
            </Button>

            <div className="flex flex-col gap-0.5 items-start text-sm">
              <small className={inter.className}>
                &bull;{' '}
                <Link className="underline" href="/celo-sepolia">
                  Use the faucet without signing in
                </Link>{' '}
                — you still get tokens, just a smaller amount
              </small>
              {problem && !problem.actionable && (
                <small className={inter.className}>
                  &bull;{' '}
                  <Link
                    className="underline"
                    href="https://github.com/celo-org/faucet/issues/new/choose"
                  >
                    Report this
                  </Link>{' '}
                  and quote <code>{error}</code>
                </small>
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    </>
  )
}

export default SignIn

// Read server-side so the failure is in the first byte of HTML. On a
// statically optimised page `router.query` is empty until hydration, so the
// visitor would see the neutral sign-in prompt and never learn what failed.
export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => ({
  props: {
    error: typeof ctx.query.error === 'string' ? ctx.query.error : null,
    callbackUrl:
      typeof ctx.query.callbackUrl === 'string'
        ? ctx.query.callbackUrl
        : '/celo-sepolia',
  },
})

import { GetServerSideProps, NextPage } from 'next'
import Head from 'next/head'
import Link from 'next/link'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../@/components/ui/card'
import { FaucetHeader } from 'components/faucet-header'
import styles from 'styles/Home.module.css'
import { authErrorCopy, AUTH_ERROR_FALLBACK } from 'utils/auth-errors'
import { inter } from 'utils/inter'

interface Props {
  code: string | null
}

const AuthError: NextPage<Props> = ({ code }) => {
  const { title, detail } = authErrorCopy(code) ?? AUTH_ERROR_FALLBACK

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

// Server-side for the same reason as /signin: the error must be in the
// initial HTML, not applied after hydration.
export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => ({
  props: {
    code: typeof ctx.query.error === 'string' ? ctx.query.error : null,
  },
})

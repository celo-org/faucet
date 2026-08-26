import { NextPage } from 'next'
import { useSession } from 'next-auth/react'
import Head from 'next/head'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '../@/components/ui/button'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../@/components/ui/card'
import { Input } from '../@/components/ui/input'
import { Label } from '../@/components/ui/label'
import { FaucetHeader } from 'components/faucet-header'
import styles from 'styles/Home.module.css'
import { ApiKeyRecord, KEY_TTL_DAYS, MAX_KEYS_PER_OWNER } from 'types'
import { inter } from 'utils/inter'

const formatDate = (ms: number) => new Date(ms).toISOString().slice(0, 10)

const ApiKeys: NextPage = () => {
  const { data: session, status } = useSession()
  const [keys, setKeys] = useState<ApiKeyRecord[]>([])
  const [label, setLabel] = useState('')
  const [freshKey, setFreshKey] = useState<string>()
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/keys')
    if (res.ok) {
      setKeys((await res.json()).keys)
    }
  }, [])

  useEffect(() => {
    if (session) {
      load().catch(console.error)
    }
  }, [session, load])

  const create = useCallback(async () => {
    setBusy(true)
    setError(undefined)
    setCopied(false)
    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.message)
        return
      }
      // Shown once; the server only ever stored a hash of it.
      setFreshKey(data.key)
      setLabel('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }, [label, load])

  const copy = useCallback(async () => {
    if (!freshKey) {
      return
    }
    await navigator.clipboard.writeText(freshKey)
    setCopied(true)
  }, [freshKey])

  const revoke = useCallback(
    async (keyId: string) => {
      setBusy(true)
      try {
        await fetch(`/api/keys/${keyId}`, { method: 'DELETE' })
        await load()
      } finally {
        setBusy(false)
      }
    },
    [load],
  )

  const atCap = keys.length >= MAX_KEYS_PER_OWNER

  return (
    <>
      <Head>
        <title>Faucet API Keys</title>
        <meta
          name="description"
          content="Create an API key for programmatic access to the Celo faucet"
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main className={styles.main}>
        <FaucetHeader network="celo-sepolia" isOutOfCELO={false} />

        <Card className="w-full max-w-lg items-stretch">
          <CardHeader>
            <CardTitle>API Keys</CardTitle>
          </CardHeader>

          <CardContent className="flex flex-col gap-4">
            <p className={`${inter.className} text-sm`}>
              An API key lets scripts and AI agents call the faucet without
              solving a captcha. Requests draw on your GitHub account&apos;s
              daily allowance, so a key changes how you prove who you are, not
              how much you can request.
            </p>

            {status === 'loading' && (
              <small className={inter.className}>Loading&hellip;</small>
            )}

            {status !== 'loading' && !session && (
              <small className={inter.className}>
                &bull;{' '}
                <Link className="underline" href="/api/auth/signin/github">
                  Authenticate with GitHub
                </Link>{' '}
                to create a key
              </small>
            )}

            {session && (
              <>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="label">Key name</Label>
                  <div className="flex gap-2">
                    <Input
                      id="label"
                      value={label}
                      placeholder="e.g. local celo-mcp"
                      maxLength={60}
                      disabled={atCap}
                      onChange={(e) => setLabel(e.target.value)}
                    />
                    <Button
                      onClick={create}
                      disabled={busy || atCap || !label.trim()}
                      type="button"
                    >
                      Create
                    </Button>
                  </div>
                  {atCap && (
                    <small className={inter.className}>
                      You are at the limit of {MAX_KEYS_PER_OWNER} keys. Revoke
                      one to create another.
                    </small>
                  )}
                </div>

                {error && (
                  <small className={inter.className} role="alert">
                    {error}
                  </small>
                )}

                {freshKey && (
                  <div className="flex flex-col gap-2 border-2 border-border p-3">
                    <b className="text-sm">
                      Copy this key now — it is not shown again.
                    </b>
                    <code className="break-all text-xs">{freshKey}</code>
                    <div className="flex items-center gap-2">
                      <Button type="button" variant="neutral" onClick={copy}>
                        Copy key
                      </Button>
                      <small aria-live="polite" className={inter.className}>
                        {copied ? 'Copied to clipboard' : ''}
                      </small>
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  {keys.length === 0 ? (
                    <small className={inter.className}>
                      You have no active keys.
                    </small>
                  ) : (
                    keys.map((key) => (
                      <div
                        key={key.keyId}
                        className="flex items-center justify-between gap-2 border-2 border-border p-2"
                      >
                        <div className="flex flex-col">
                          <span className="text-sm">{key.label}</span>
                          <small className="text-xs opacity-70">
                            {key.keyId} &bull; expires{' '}
                            {formatDate(key.expiresAt)}
                          </small>
                        </div>
                        <Button
                          variant="neutral"
                          type="button"
                          disabled={busy}
                          onClick={() => revoke(key.keyId)}
                        >
                          Revoke
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </CardContent>

          <CardFooter className="flex-col gap-2">
            <div className="mt-4 text-sm flex flex-col gap-0.5 items-start">
              <small className={inter.className}>
                &bull; You may hold {MAX_KEYS_PER_OWNER} keys. They expire after{' '}
                {KEY_TTL_DAYS} days.
              </small>
              <small className={inter.className}>
                &bull; Never commit a key. Keys found in public repositories are
                revoked without notice.
              </small>
              <small className={inter.className}>
                &bull;{' '}
                <Link className="underline" href="/celo-sepolia">
                  Back to the faucet
                </Link>
              </small>
            </div>
          </CardFooter>
        </Card>

        <footer className={styles.grid}>
          <Card className={styles.card}>
            <h3 className={inter.className}>Using your key</h3>
            <div className="flex flex-col gap-1">
              <p className={inter.className}>
                Send it as a bearer token and leave out the captcha:
              </p>
              <pre className="overflow-x-auto text-xs">
                <code>{`curl -X POST https://faucet.celo.org/api/faucet \\
  -H "Authorization: Bearer $CELO_FAUCET_API_KEY" \\
  -H 'Content-Type: application/json' \\
  -d '{"beneficiary":"0x…","network":"celo-sepolia"}'`}</code>
              </pre>
            </div>
          </Card>

          <Card className={styles.card}>
            <h3 className={inter.className}>Limits</h3>
            <div className="flex flex-col gap-1">
              <p className={inter.className}>
                &bull; Keyed requests share your GitHub account&apos;s allowance
                of 10 per day.
              </p>
              <p className={inter.className}>
                &bull; Holding two keys does not double it.
              </p>
              <p className={inter.className}>
                &bull; Celo Sepolia only. There is no mainnet access.
              </p>
            </div>
          </Card>

          <Card className={styles.card}>
            <h3 className={inter.className}>Check the outcome</h3>
            <div className="flex flex-col gap-1">
              <p className={inter.className}>
                A request returns a key. Poll it for the transaction hash:
              </p>
              <pre className="whitespace-pre-wrap break-all text-xs">
                <code>{`GET /api/status?key=<key>&network=celo-sepolia`}</code>
              </pre>
            </div>
          </Card>

          <Card className={styles.card}>
            <a
              href="https://github.com/celo-org/faucet#programmatic-access-api-keys"
              target="_blank"
              tabIndex={0}
              rel="noopener noreferrer"
            >
              <h3 className={inter.className}>
                Read the docs <span>&rarr;</span>
              </h3>
              <p className={inter.className}>
                Response codes, rate limits and the status endpoint
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
                Ask questions <span>&rarr;</span>
              </h3>
              <p className={inter.className}>
                Chat with the Celo community on Discord
              </p>
            </a>
          </Card>
        </footer>
      </main>
    </>
  )
}

export default ApiKeys

import { NextPage } from 'next'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '../@/components/ui/button'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from '../@/components/ui/card'
import { Input } from '../@/components/ui/input'
import { Label } from '../@/components/ui/label'
import { FaucetHeader } from 'components/faucet-header'
import { JsonLd } from 'components/json-ld'
import { Seo } from 'components/seo'
import { DAILY_REQUESTS, SITE_URL } from 'config/site'
import styles from 'styles/Home.module.css'
import { ApiKeyRecord, KEY_TTL_DAYS, MAX_KEYS_PER_OWNER } from 'types'
import { inter } from 'utils/inter'

const formatDate = (ms: number) => new Date(ms).toISOString().slice(0, 10)

const ApiKeys: NextPage = () => {
  const { data: session } = useSession()
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
      <Seo
        title="Faucet API Keys — Programmatic Access for Scripts and AI Agents"
        description={`Create an API key to call the Celo faucet over HTTP without solving a captcha. Up to ${MAX_KEYS_PER_OWNER} keys per GitHub account, valid ${KEY_TTL_DAYS} days, Celo Sepolia only.`}
        path="/keys"
      />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'WebAPI',
              '@id': `${SITE_URL}/keys#api`,
              name: 'Celo Faucet API',
              description:
                'Request free testnet CELO on Celo Sepolia over HTTP. Authenticate with a bearer API key to skip the captcha.',
              documentation: `${SITE_URL}/keys`,
              termsOfService: 'https://github.com/celo-org/faucet',
              provider: { '@type': 'Organization', name: 'Celo' },
              potentialAction: {
                '@type': 'ConsumeAction',
                target: `${SITE_URL}/api/faucet`,
              },
            },
            {
              '@type': 'HowTo',
              '@id': `${SITE_URL}/keys#howto`,
              name: 'Get a Celo faucet API key for an agent',
              step: [
                {
                  '@type': 'HowToStep',
                  name: 'Sign in',
                  text: 'Sign in with GitHub. The key is bound to that account.',
                },
                {
                  '@type': 'HowToStep',
                  name: 'Create the key',
                  text: 'Name the key and create it. It is displayed once and stored only as a hash.',
                },
                {
                  '@type': 'HowToStep',
                  name: 'Send it as a bearer token',
                  text: 'Pass the key as an Authorization: Bearer header on POST /api/faucet, then poll GET /api/status for the transaction hash.',
                },
              ],
            },
          ],
        }}
      />
      <main className={styles.main}>
        <FaucetHeader network="celo-sepolia" isOutOfCELO={false} />

        <Card className="w-full max-w-lg items-stretch">
          <CardHeader>
            {/*
              A real h1 rather than CardTitle: that renders a div, so this page
              shipped with no h1 or h2 at all.
            */}
            <h1 className="font-heading leading-none">API Keys</h1>
          </CardHeader>

          <CardContent className="flex flex-col gap-4">
            <p className={`${inter.className} text-sm`}>
              An API key lets scripts and AI agents call the faucet without
              solving a captcha. Requests draw on your GitHub account&apos;s
              daily allowance, so a key changes how you prove who you are, not
              how much you can request.
            </p>

            {/*
              Gated on the session alone, not on `status !== 'loading'`.
              This page is statically optimised, so at prerender the session is
              always loading: the old condition put a bare "Loading…" in the
              HTML a crawler receives and left the only route to a key visible
              solely after hydration. The cost is that a signed-in visitor may
              see this line for one frame before the session resolves.
            */}
            {!session && (
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
            <h2 className={inter.className}>Using your key</h2>
            <div className="flex flex-col gap-1">
              <p className={inter.className}>
                Send it as a bearer token and leave out the captcha:
              </p>
              {/*
                The placeholder address is spelled out rather than elided. It
                used to read "0x…" with a real ellipsis character, which is
                invalid input: anything copying this block verbatim — which is
                the entire point of publishing it for agents — sent a malformed
                beneficiary and got a 400 back.
              */}
              <pre className="overflow-x-auto text-xs">
                <code>{`curl -X POST https://faucet.celo.org/api/faucet \\
  -H "Authorization: Bearer $CELO_FAUCET_API_KEY" \\
  -H 'Content-Type: application/json' \\
  -d '{"beneficiary":"0xYOUR_ADDRESS","network":"celo-sepolia"}'`}</code>
              </pre>
            </div>
          </Card>

          <Card className={styles.card}>
            <h2 className={inter.className}>Limits</h2>
            <div className="flex flex-col gap-1">
              {/*
                Read from the constants rather than spelled out. These numbers
                were hardcoded here while the same values already existed in
                types/index.ts and firebase.serverside.ts, so the published
                limits could drift from the enforced ones.
              */}
              <p className={inter.className}>
                &bull; Keyed requests share your GitHub account&apos;s allowance
                of {DAILY_REQUESTS.authenticated} per day.
              </p>
              <p className={inter.className}>
                &bull; Holding {MAX_KEYS_PER_OWNER} keys does not double it.
              </p>
              <p className={inter.className}>
                &bull; Keys expire after {KEY_TTL_DAYS} days.
              </p>
              <p className={inter.className}>
                &bull; Celo Sepolia only. There is no mainnet access.
              </p>
            </div>
          </Card>

          {/*
            The error table used to live only in the GitHub README, so the one
            thing an agent needs in order to behave correctly — whether to
            retry, back off, or give up — was off-domain and inside a page it
            had to parse as prose.
          */}
          <Card className={styles.card}>
            <h2 className={inter.className}>Response codes</h2>
            <div className="flex flex-col gap-1">
              <p className={inter.className}>
                &bull; <code>200</code> — queued. Poll the status endpoint.
              </p>
              <p className={inter.className}>
                &bull; <code>400</code> — invalid network or beneficiary
                address.
              </p>
              <p className={inter.className}>
                &bull; <code>401 invalid_api_key</code> — missing, unknown or
                expired key.
              </p>
              <p className={inter.className}>
                &bull; <code>429 faucet_limit_exceeded</code> — rate limited.
                Honour <code>Retry-After</code>.
              </p>
              <p className={inter.className}>
                &bull; <code>503 faucet_unavailable</code> — a dependency is
                down. Retry after 30s.
              </p>
              <p className={inter.className}>
                &bull; Schema:{' '}
                <Link className="underline" href="/openapi.json">
                  openapi.json
                </Link>
              </p>
            </div>
          </Card>

          <Card className={styles.card}>
            <h2 className={inter.className}>Check the outcome</h2>
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
              <h2 className={inter.className}>
                Read the docs <span>&rarr;</span>
              </h2>
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
              <h2 className={inter.className}>
                Ask questions <span>&rarr;</span>
              </h2>
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

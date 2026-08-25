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
import { GitHubAuth } from 'components/github-auth'
import styles from 'styles/Home.module.css'
import { ApiKeyRecord, KEY_TTL_DAYS, MAX_KEYS_PER_OWNER } from 'types'
import { inter } from 'utils/inter'

const formatDate = (ms: number) => new Date(ms).toISOString().slice(0, 10)

const ApiKeys: NextPage = () => {
  const { data: session, status } = useSession()
  const [keys, setKeys] = useState<ApiKeyRecord[]>([])
  const [label, setLabel] = useState('')
  const [freshKey, setFreshKey] = useState<string>()
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
        <Card className="w-full max-w-xl items-stretch">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Faucet API Keys</CardTitle>
            <GitHubAuth />
          </CardHeader>

          <CardContent className="flex flex-col gap-4">
            <p className={`${inter.className} text-sm`}>
              An API key lets scripts and AI agents call the faucet without
              solving a captcha. Requests share your GitHub account&apos;s daily
              allowance, so a key changes how you prove who you are, not how
              much you can request.
            </p>

            {status === 'loading' && <p className="text-sm">Loading…</p>}

            {status !== 'loading' && !session && (
              <p className={`${inter.className} text-sm`}>
                Sign in with GitHub to create a key.
              </p>
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
                      onChange={(e) => setLabel(e.target.value)}
                    />
                    <Button
                      onClick={create}
                      disabled={busy || !label.trim()}
                      type="button"
                    >
                      Create
                    </Button>
                  </div>
                </div>

                {error && (
                  <p className="text-sm text-red-500" role="alert">
                    {error}
                  </p>
                )}

                {freshKey && (
                  <div className="flex flex-col gap-1 rounded-md border p-3">
                    <b className="text-sm">
                      Copy this key now. It will not be shown again.
                    </b>
                    <code className="break-all text-xs">{freshKey}</code>
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  {keys.length === 0 && (
                    <small className={inter.className}>
                      You have no active keys.
                    </small>
                  )}
                  {keys.map((key) => (
                    <div
                      key={key.keyId}
                      className="flex items-center justify-between gap-2 rounded-md border p-2"
                    >
                      <div className="flex flex-col">
                        <span className="text-sm">{key.label}</span>
                        <small className="text-xs opacity-70">
                          {key.keyId} &bull; expires {formatDate(key.expiresAt)}
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
                  ))}
                </div>
              </>
            )}
          </CardContent>

          <CardFooter>
            <div className="flex flex-col gap-1 text-sm">
              <small className={inter.className}>
                &bull; You can hold up to {MAX_KEYS_PER_OWNER} keys. Keys expire
                after {KEY_TTL_DAYS} days.
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
      </main>
    </>
  )
}

export default ApiKeys

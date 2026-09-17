import Head from 'next/head'
import { FC } from 'react'
import { SITE_NAME, SITE_URL } from 'config/site'

interface Props {
  title: string
  description: string
  /** Path with a leading slash, e.g. `/keys`. Canonical and og:url are built from it. */
  path: string
  /** Sign-in and error pages stay out of the index; they get no canonical either. */
  noindex?: boolean
}

/**
 * One place for page metadata.
 *
 * Previously four pages each hand-rolled a <Head> with a title, a description,
 * a viewport tag and a favicon link, and none of them carried a canonical URL
 * or an og:/twitter: card — so every link to the faucet rendered as a bare URL
 * with no preview anywhere it was shared.
 */
export const Seo: FC<Props> = ({ title, description, path, noindex }) => {
  const url = `${SITE_URL}${path}`
  const image = `${SITE_URL}/api/og?title=${encodeURIComponent(title)}`

  return (
    <Head>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <link rel="icon" href="/favicon.ico" />

      {noindex ? (
        <meta name="robots" content="noindex" />
      ) : (
        <link rel="canonical" href={url} />
      )}

      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={image} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />
    </Head>
  )
}

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * No jsdom/RTL in this repo, so these assert the source rather than a render,
 * following tests/faucet-header.test.ts.
 */
const read = (...parts: string[]) =>
  readFileSync(join(__dirname, '..', ...parts), 'utf8')

const seo = read('components', 'seo.tsx')

/** Every page that renders a document head. */
const PAGES = ['[chain].tsx', 'keys.tsx', 'signin.tsx', 'auth-error.tsx']

describe('Seo component', () => {
  it('emits an og: and twitter: card', () => {
    // Regression: the app shipped no og: or twitter: tags at all, so every
    // link to the faucet unfurled as a bare URL with no preview.
    for (const tag of [
      'og:type',
      'og:title',
      'og:description',
      'og:url',
      'og:image',
      'twitter:card',
      'twitter:title',
      'twitter:image',
    ]) {
      expect(seo).toContain(tag)
    }
    expect(seo).toContain('summary_large_image')
  })

  it('builds canonical and og:url from one origin constant', () => {
    expect(seo).toMatch(/const url = `\$\{SITE_URL\}\$\{path\}`/)
  })

  // A noindex page asking to be canonicalised is a contradictory signal, so the
  // two are deliberately exclusive rather than both emitted.
  it('emits a canonical only when the page is indexable', () => {
    expect(seo).toMatch(
      /noindex \?[\s\S]*?name="robots" content="noindex"[\s\S]*?:[\s\S]*?rel="canonical"/,
    )
  })
})

describe('pages route their metadata through Seo', () => {
  it.each(PAGES)('%s uses Seo', (page) => {
    const source = read('pages', page)
    expect(source).toContain("from 'components/seo'")
    expect(source).toMatch(/<Seo\b/)
  })

  // Regression: four pages each hand-rolled a <Head> and none carried a
  // canonical or a card. Anything new must not start a fifth copy.
  it.each(PAGES)('%s no longer hand-rolls a document head', (page) => {
    const source = read('pages', page)
    expect(source).not.toContain("from 'next/head'")
    expect(source).not.toMatch(/<title>/)
  })

  it.each(PAGES)('%s passes a path so the canonical is not guessed', (page) => {
    expect(read('pages', page)).toMatch(/path=[{"]/)
  })

  it('keeps the auth pages out of the index', () => {
    for (const page of ['signin.tsx', 'auth-error.tsx']) {
      expect(read('pages', page)).toMatch(/noindex/)
    }
    for (const page of ['[chain].tsx', 'keys.tsx']) {
      expect(read('pages', page)).not.toMatch(/noindex/)
    }
  })
})

describe('heading structure', () => {
  /**
   * Regression: CardTitle renders a div, so both indexable pages shipped with
   * no h1 or h2 at all and the only ranked headings were the footer link
   * cards — the least important content on the page.
   */
  it.each(['[chain].tsx', 'keys.tsx'])('%s has exactly one h1', (page) => {
    const source = read('pages', page)
    expect(source.match(/<h1\b/g)).toHaveLength(1)
  })

  it.each(['[chain].tsx', 'keys.tsx'])(
    '%s ranks its footer cards below the h1',
    (page) => {
      const source = read('pages', page)
      expect(source).toMatch(/<h2\b/)
      expect(source).not.toMatch(/<h3\b/)
    },
  )
})

describe('structured data', () => {
  it.each(['[chain].tsx', 'keys.tsx'])('%s emits JSON-LD', (page) => {
    const source = read('pages', page)
    expect(source).toContain("from 'components/json-ld'")
    expect(source).toContain('https://schema.org')
  })

  it('answers the questions people actually ask the faucet', () => {
    const source = read('pages', '[chain].tsx')
    expect(source).toContain('FAQPage')
    expect(source).toMatch(/How much CELO does each request send\?/)
    expect(source).toMatch(/Does the Celo faucet have an API\?/)
    expect(source).toMatch(/How can an AI agent or a script get testnet CELO\?/)
  })

  it('renders JSON-LD in the body, not inside next/head', () => {
    // next/head serialises its children and mangles a script tag.
    const jsonLd = read('components', 'json-ld.tsx')
    expect(jsonLd).toContain('application/ld+json')
    expect(jsonLd).not.toContain("from 'next/head'")
  })
})

describe('the published curl is copy-pasteable', () => {
  /**
   * Regression: the placeholder read "0x…" with a real U+2026 ellipsis. An
   * agent lifting the snippet verbatim — the entire reason it is published —
   * sent a malformed beneficiary and got a 400 back.
   */
  it('has no elided placeholders inside the snippet', () => {
    const snippet = read('pages', 'keys.tsx').match(/curl -X POST[\s\S]*?'`/)
    expect(snippet).not.toBeNull()
    expect(snippet![0]).not.toContain('…')
  })
})

describe('the network is identified in prose', () => {
  /**
   * The chain ID lived only in the JSON-LD, so an assistant reading the page
   * answered "NOT STATED" when asked which chain this faucet funds.
   */
  it('names the chain ID in an answer, not just in structured data', () => {
    const source = read('pages', '[chain].tsx')
    const faqs = source.slice(
      source.indexOf('const faqs'),
      source.indexOf('return ('),
    )
    expect(faqs).toContain('chain ID ${ChainId[network]}')
  })
})

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Source assertions, like faucet-header.test.ts, since there is no DOM test
 * setup here. They pin the #303 fixes that a later edit could quietly undo.
 * Layout itself (no horizontal overflow at 375/1024/1440/1920) was measured in
 * a browser and is not something these can see.
 */
const read = (...p: string[]) =>
  readFileSync(join(__dirname, '..', ...p), 'utf8')

const keys = read('pages', 'keys.tsx')
const claim = read('pages', '[chain].tsx')
const home = read('styles', 'Home.module.css')
const codeBlock = read('styles', 'CodeBlock.module.css')

describe('/keys code samples', () => {
  it('renders every snippet through CodeBlock, not a bare <pre>', () => {
    expect(keys).not.toMatch(/<pre[\s>]/)
    expect(keys.match(/<CodeBlock\b/g)?.length).toBe(3)
  })

  // A wrapped curl line or a status URL broken mid-token reads as two commands.
  it('scrolls long lines instead of wrapping them', () => {
    expect(codeBlock).toMatch(/white-space:\s*pre;/)
    expect(codeBlock).toMatch(/overflow-x:\s*auto;/)
    expect(keys).not.toMatch(/break-all[^"]*">\s*<code>/)
  })
})

describe('/keys way back to the faucet', () => {
  it('points the footer link at the page network, not a literal', () => {
    expect(keys).toMatch(
      /href=\{`\/\$\{KEYS_NETWORK\}`\}>\s*Back to the faucet/,
    )
    expect(keys).not.toMatch(/href="\/celo-sepolia"/)
    expect(keys).toMatch(/<FaucetHeader network=\{KEYS_NETWORK\}/)
  })
})

describe('card widths and info cards', () => {
  it('gives the claim card and the keys card the same max width', () => {
    const width = (src: string) =>
      src.match(/<Card className="w-full (max-w-\w+) items-stretch">/)?.[1]
    expect(width(claim)).toBeDefined()
    expect(width(claim)).toBe(width(keys))
  })

  it('does not cap info-card text at 30ch', () => {
    expect(home).not.toMatch(/max-width:\s*30ch/)
  })

  // A min-content column let a long code line push /keys 238px past a 375px
  // screen; equal shares of the width cannot be widened by their content.
  it('sizes grid columns as shares of the width, not content minimums', () => {
    expect(home).not.toMatch(/minmax\(25%,\s*auto\)/)
    expect(home).not.toMatch(/repeat\(2,\s*50%\)/)
    expect(home).toMatch(/\.card \{[^}]*min-width:\s*0;/)
  })
})

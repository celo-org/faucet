export type NavPage = 'faucet' | 'keys'

/**
 * Which header nav item is the current page, from the Next.js route pattern
 * (`useRouter().pathname`, so `/[chain]` rather than `/celo-sepolia`).
 */
export function currentPage(pathname: string): NavPage | undefined {
  if (pathname === '/[chain]') return 'faucet'
  if (pathname === '/keys') return 'keys'
  return undefined
}

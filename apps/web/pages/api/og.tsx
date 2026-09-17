import { ImageResponse } from 'next/og'

/**
 * Social card, generated rather than committed as a binary.
 *
 * Every link to the faucet used to unfurl as a bare URL: the app shipped no
 * og: or twitter: tags at all and there was no image asset to point them at.
 */
export const config = { runtime: 'edge' }

// Matches --background and --main in styles/globals.css.
const CREAM = 'rgb(252, 246, 241)'
const ACID = 'rgb(252, 255, 82)'

export default function handler(req: Request) {
  const title =
    new URL(req.url).searchParams.get('title')?.slice(0, 80) || 'Celo Faucet'

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: CREAM,
        padding: 72,
        border: '16px solid black',
      }}
    >
      <div style={{ display: 'flex', fontSize: 34, fontWeight: 600 }}>
        faucet.celo.org
      </div>
      <div
        style={{
          display: 'flex',
          fontSize: 86,
          fontWeight: 800,
          lineHeight: 1.1,
          letterSpacing: -2,
        }}
      >
        {title}
      </div>
      <div style={{ display: 'flex' }}>
        <div
          style={{
            display: 'flex',
            background: ACID,
            border: '4px solid black',
            boxShadow: '8px 8px 0 black',
            padding: '18px 28px',
            fontSize: 32,
            fontWeight: 700,
          }}
        >
          Free testnet CELO on Celo Sepolia
        </div>
      </div>
    </div>,
    { width: 1200, height: 630 },
  )
}

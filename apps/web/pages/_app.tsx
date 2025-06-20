import { Analytics } from '@vercel/analytics/react'
import { SessionProvider } from 'next-auth/react'
import type { AppProps } from 'next/app'
import { GoogleReCaptchaProvider } from 'react-google-recaptcha-v3'
import 'styles/globals.css'

export default function App({
  Component,
  pageProps: { session, ...pageProps },
}: AppProps) {
  return (
    <>
      <GoogleReCaptchaProvider
        reCaptchaKey={process.env.NEXT_PUBLIC_RECAPTCHA_KEY as string}
      >
        <SessionProvider session={session}>
          <Component {...pageProps} />
        </SessionProvider>
      </GoogleReCaptchaProvider>
      <Analytics />
    </>
  )
}

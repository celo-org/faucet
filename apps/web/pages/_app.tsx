import type { AppProps } from 'next/app'
import { GoogleReCaptchaProvider } from 'react-google-recaptcha-v3'
import 'styles/globals.css'
import { Analytics } from '@vercel/analytics/react';


export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <GoogleReCaptchaProvider reCaptchaKey={process.env.NEXT_PUBLIC_RECAPTCHA_KEY as string}>
        <Component {...pageProps} />
      </GoogleReCaptchaProvider>
      <Analytics/>
    </>
  )
}

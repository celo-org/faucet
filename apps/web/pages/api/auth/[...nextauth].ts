import NextAuth, { AuthOptions, Profile, Session } from 'next-auth'
import GithubProvider from 'next-auth/providers/github'

type ExtendedProfile = {
  created_at?: string
} & Profile

interface ExtendedUser {
  created_at?: string
  name?: string | null
  email?: string | null
  image?: string | null
}

type ExtendedSession = {
  user?: ExtendedUser
} & Session

export const authOptions: AuthOptions = {
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_ID || '',
      clientSecret: process.env.GITHUB_SECRET || '',
      // GitHub now returns the RFC 9207 `iss` parameter on the callback.
      // openid-client validates it against the issuer, and next-auth 4.24.13's
      // GitHub provider does not set one, so every sign-in fails with
      // "issuer must be configured on the issuer". Upstream added this same
      // value in 4.24.14; setting it here fixes sign-in without waiting on the
      // dependency bump, and deep-merges harmlessly once that lands.
      issuer: 'https://github.com/login/oauth',
    }),
  ],
  callbacks: {
    async jwt({ token, profile }) {
      if (profile) {
        const extProfile: ExtendedProfile = profile
        token.user_created_at = extProfile.created_at
      }
      return token
    },
    async session({ session, token, user }) {
      const extSession: ExtendedSession = session
      if (extSession.user) {
        extSession.user.created_at = token.user_created_at as string
      }
      return session
    },
  },
  // next-auth only offers "Try signing in with a different account" for most
  // failures, which sends people round a loop when the cause is server-side.
  //
  // signIn matters more than error here: core/index.js routes the common codes
  // (OAuthCallback, Callback, OAuthSignin, ...) to the *sign-in* page rather
  // than to pages.error, forwarding the code as `?error=`. Only the remaining
  // codes, such as Configuration, reach pages.error.
  pages: {
    signIn: '/signin',
    error: '/auth-error',
  },
  // Long enough to mint and copy an API key on /keys. Sessions only select the
  // authenticated tier; the durable control is the per-identity rate-limit
  // bucket keyed on sha256(email), which survives across sessions, so a longer
  // session grants no extra funds.
  session: {
    maxAge: 15 * 60, // 15 minutes in seconds
  },
  jwt: {
    maxAge: 15 * 60, // seconds
  },
}

export default NextAuth(authOptions)

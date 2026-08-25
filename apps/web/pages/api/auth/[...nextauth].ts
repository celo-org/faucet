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

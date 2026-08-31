/**
 * Plain-English copy for next-auth error codes.
 *
 * next-auth shows "Try signing in with a different account" for nearly every
 * failure, including server-side ones, which sends people round a loop
 * changing accounts that were never the problem. These say who can fix it.
 */
export interface AuthErrorCopy {
  title: string
  detail: string
  /** False when nothing the visitor does differently will help. */
  actionable: boolean
}

export const AUTH_ERRORS: Record<string, AuthErrorCopy> = {
  Configuration: {
    title: 'The faucet is misconfigured',
    detail:
      'Sign-in cannot complete because of a server-side setting. Nothing you do differently will help.',
    actionable: false,
  },
  OAuthCallback: {
    title: 'GitHub sign-in could not be completed',
    detail:
      'GitHub sent us back but the response was rejected. This is a problem on the faucet side, not with your account.',
    actionable: false,
  },
  Callback: {
    title: 'Sign-in could not be completed',
    detail:
      'The faucet failed while finishing your sign-in. This is a problem on our side, not with your account.',
    actionable: false,
  },
  OAuthSignin: {
    title: 'Could not reach GitHub',
    detail:
      'The faucet failed to start the GitHub sign-in. This is usually temporary.',
    actionable: true,
  },
  OAuthCreateAccount: {
    title: 'Could not create your account',
    detail: 'The faucet could not record your GitHub account.',
    actionable: false,
  },
  OAuthAccountNotLinked: {
    title: 'That account is already linked elsewhere',
    detail: 'Sign in with the same GitHub account you used the first time.',
    actionable: true,
  },
  AccessDenied: {
    title: 'GitHub access was declined',
    detail:
      'You cancelled the authorisation, or GitHub refused it. Try again and approve the request.',
    actionable: true,
  },
  Verification: {
    title: 'That sign-in link has expired',
    detail: 'Request a new one and use it straight away.',
    actionable: true,
  },
  SessionRequired: {
    title: 'You need to be signed in',
    detail: 'Sign in with GitHub to continue.',
    actionable: true,
  },
}

export const AUTH_ERROR_FALLBACK: AuthErrorCopy = {
  title: 'Sign-in failed',
  detail:
    'Something went wrong while signing in. If it keeps happening it is likely a problem on the faucet side rather than with your account.',
  actionable: true,
}

export function authErrorCopy(code: unknown): AuthErrorCopy | undefined {
  if (typeof code !== 'string' || !code) {
    return undefined
  }
  return AUTH_ERRORS[code] ?? AUTH_ERROR_FALLBACK
}

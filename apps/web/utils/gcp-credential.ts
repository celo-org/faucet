/**
 * Custom Firebase Admin credential that authenticates via
 * Vercel OIDC → GCP Workload Identity Federation → Service Account impersonation.
 *
 * Env vars required on Vercel:
 *   GCP_WIF_PROVIDER  – full WIF provider resource name
 *                       (e.g. //iam.googleapis.com/projects/123/locations/global/workloadIdentityPools/pool/providers/provider)
 *   GCP_SERVICE_ACCOUNT – service account email to impersonate
 *                         (e.g. faucet-web@celo-faucet.iam.gserviceaccount.com)
 *
 * Falls back to Application Default Credentials for local development
 * (run `gcloud auth application-default login` locally).
 */

import { applicationDefault, Credential } from 'firebase-admin/app'

class VercelWorkloadIdentityCredential implements Credential {
  private audience: string
  private serviceAccount: string

  constructor(audience: string, serviceAccount: string) {
    this.audience = audience
    this.serviceAccount = serviceAccount
  }

  async getAccessToken(): Promise<{
    access_token: string
    expires_in: number
  }> {
    const oidcToken = process.env.VERCEL_OIDC_TOKEN
    if (!oidcToken) {
      throw new Error(
        'VERCEL_OIDC_TOKEN not available — is this running on Vercel?',
      )
    }

    // Step 1: Exchange Vercel OIDC token for a GCP federated token via STS
    const stsRes = await fetch('https://sts.googleapis.com/v1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
        audience: this.audience,
        scope: 'https://www.googleapis.com/auth/cloud-platform',
        requested_token_type: 'urn:ietf:params:oauth:token-type:access_token',
        subject_token: oidcToken,
        subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
      }),
    })

    if (!stsRes.ok) {
      const body = await stsRes.text()
      throw new Error(
        `GCP STS token exchange failed (${stsRes.status}): ${body}`,
      )
    }

    const { access_token: federatedToken } = await stsRes.json()

    // Step 2: Impersonate the target service account
    const impersonateRes = await fetch(
      `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${this.serviceAccount}:generateAccessToken`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${federatedToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scope: [
            'https://www.googleapis.com/auth/firebase.database',
            'https://www.googleapis.com/auth/userinfo.email',
          ],
          lifetime: '3600s',
        }),
      },
    )

    if (!impersonateRes.ok) {
      const body = await impersonateRes.text()
      throw new Error(
        `GCP service account impersonation failed (${impersonateRes.status}): ${body}`,
      )
    }

    const { accessToken, expireTime } = await impersonateRes.json()

    return {
      access_token: accessToken,
      expires_in: Math.floor(
        (new Date(expireTime).getTime() - Date.now()) / 1000,
      ),
    }
  }
}

export function getFirebaseCredential(): Credential {
  const wifProvider = process.env.GCP_WIF_PROVIDER
  const serviceAccount = process.env.GCP_SERVICE_ACCOUNT

  if (wifProvider && serviceAccount) {
    return new VercelWorkloadIdentityCredential(wifProvider, serviceAccount)
  }

  // Local development: uses gcloud CLI credentials or GOOGLE_APPLICATION_CREDENTIALS
  return applicationDefault()
}

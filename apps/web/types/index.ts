export type Address = string
export type E164Number = string

export const networks = ['celo-sepolia'] as const
export type Network = (typeof networks)[number]

export enum FaucetAddress {
  'celo-sepolia' = '0x22579CA45eE22E2E16dDF72D955D6cf4c767B0eF',
}

export enum ChainId {
  'celo-sepolia' = 11142220,
}

export enum RequestStatus {
  Pending = 'Pending',
  Working = 'Working',
  Done = 'Done',
  Failed = 'Failed',
}

export enum RequestType {
  Faucet = 'Faucet',
}

export enum AuthLevel {
  none = 'none',
  authenticated = 'authenticated',
}

export interface RequestRecord {
  beneficiary: Address
  status: RequestStatus
  type: RequestType
  dollarTxHash?: string
  goldTxHash?: string
  tokens?: RequestedTokenSet
  authLevel: AuthLevel
  timestamp?: number
}

export enum RequestedTokenSet {
  All = 'All',
  Stables = 'Stables',
  Celo = 'Celo',
}

/**
 * API-key metadata. Lives here rather than in utils/api-key so the keys page
 * can render it without pulling node:crypto into the client bundle.
 */
export interface ApiKeyRecord {
  keyId: string
  label: string
  ownerHash: string
  createdAt: number
  expiresAt: number
}

export const MAX_KEYS_PER_OWNER = 2
export const KEY_TTL_DAYS = 90

export type FaucetAPIResponse =
  | {
      status: RequestStatus.Done | RequestStatus.Pending | RequestStatus.Pending
      key: string | null
    }
  | {
      status: RequestStatus.Failed
      message: string
      /**
       * Machine-readable code, set on the API-key path only so programmatic
       * callers can branch without parsing prose. Mirrors the CDP faucet's
       * `faucet_limit_exceeded`.
       */
      error?: 'faucet_limit_exceeded' | 'invalid_api_key' | 'api_key_disabled'
    }

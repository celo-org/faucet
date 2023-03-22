export const NETWORK = 'alfajores'

export type Address = string
export type E164Number = string

export const networks = ['alfajores', 'baklava', 'cannoli'] as const
export type Network = typeof networks[number]

export enum RequestStatus {
  Pending = "Pending",
  Working = "Working",
  Done = "Done",
  Failed = "Failed",
}

export enum RequestType {
  Faucet = "Faucet",
}

export enum AuthLevel {
  none = "none",
  authenticated = "authenticated"
}

export interface RequestRecord {
  beneficiary: Address
  status: RequestStatus
  type: RequestType
  dollarTxHash?: string
  goldTxHash?: string
  tokens?: RequestedTokenSet
  authLevel: AuthLevel
}

export enum RequestedTokenSet {
  All = 'All',
  Stables = 'Stables',
  Celo = 'Celo'
}

export type FaucetAPIResponse = {
  status: RequestStatus.Done | RequestStatus.Pending | RequestStatus.Pending,
  key: string | null
} | {
  status: RequestStatus.Failed
  message: string
}

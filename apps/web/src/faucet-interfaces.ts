export type Address = string
export type E164Number = string

export const networks = ['alfajores', 'cannoli']
export type Network = 'alfajores' | 'cannoli'

export enum FaucetAddress {
  alfajores = '0x22579CA45eE22E2E16dDF72D955D6cf4c767B0eF',
  cannoli = '0x29954EC661f0c829587ac4527825B7E8C663d0b6',
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
}

export enum RequestedTokenSet {
  All = 'All',
  Stables = 'Stables',
  Celo = 'Celo',
}

export type FaucetAPIResponse =
  | {
      status: RequestStatus.Done | RequestStatus.Pending | RequestStatus.Pending
      key: string | null
    }
  | {
      status: RequestStatus.Failed
      message: string
    }

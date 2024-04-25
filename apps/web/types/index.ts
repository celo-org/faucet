export type Address = string
export type E164Number = string

export const networks = ['alfajores', 'cannoli', 'cel2']
export type Network = 'alfajores' | 'cannoli' | 'cel2'

export enum FaucetAddress {
  alfajores = '0x22579CA45eE22E2E16dDF72D955D6cf4c767B0eF',
  cannoli = '0x29954EC661f0c829587ac4527825B7E8C663d0b6',
  cel2 = '0xfcf982bb4015852e706100b14e21f947a5bb718e',
}

export enum ChainId {
  alfajores = 44787,
  cannoli = 17323,
  cel2 = 22242220,
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

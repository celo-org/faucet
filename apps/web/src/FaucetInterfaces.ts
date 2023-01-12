export const NETWORK = "alfajores"

export type Address = string
export type E164Number = string

export enum RequestStatus {
  Pending = "Pending",
  Working = "Working",
  Done = "Done",
  Failed = "Failed",
}

export enum RequestType {
  Faucet = "Faucet",
}

export interface RequestRecord {
  beneficiary: Address
  status: RequestStatus
  type: RequestType
  dollarTxHash?: string
  goldTxHash?: string
}

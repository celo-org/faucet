import { CeloTransactionObject } from '@celo/connect'
import { ContractKit, newKitFromWeb3 } from '@celo/contractkit'
import { ensureLeading0x, privateKeyToAddress } from '@celo/utils/lib/address'
import BigNumber from 'bignumber.js'
import Web3 from 'web3'

export class CeloAdapter {
  public readonly defaultAddress: `0x${string}`
  public readonly kit: ContractKit
  private readonly privateKey: string
  private initialized: boolean = false

  constructor({ pk, nodeUrl }: { pk: string; nodeUrl: string }) {

    // To add more logging:
    // Use the debug of the contractkit. Run it with DEBUG=* (or the options)
    // @ts-ignore
    this.kit = newKitFromWeb3(new Web3(nodeUrl))
    console.info(`New kit from url: ${nodeUrl}`)
    this.privateKey = ensureLeading0x(pk)
    this.defaultAddress = privateKeyToAddress(this.privateKey)
    console.info(`Using address ${this.defaultAddress} to send transactions`)
    this.kit.connection.addAccount(this.privateKey)
    this.kit.connection.defaultAccount = this.defaultAddress
  }

  async init() {
    if (this.initialized) {
      return true
    }
    this.initialized = true
    return true
  }

  async transferGold(
    to: string,
    amount: string,
  ): Promise<CeloTransactionObject<boolean>> {
    const goldToken = await this.kit.contracts.getGoldToken()
    return goldToken.transfer(to, amount)
  }


  stop() {
    this.kit.connection.stop()
  }

  // prevent accounts which already have many tokens from gaining more
  // This is to prevent abuse on the faucet which is intended for small amounts
  fadeOutAmount(
    recipientBalance: BigNumber,
    amount: string,
    useGivenAmount: boolean,
  ) {
    const nextAmount = new BigNumber(amount)

    // TODO(Arthur):
    // Replace `HUNDRED_IN_WEI` with Web3.utils.toWei('20')
    // Use a sliding scale instead of if-else statements
    if (useGivenAmount) {
      return nextAmount
    } else if (
      recipientBalance.isGreaterThan(
        HUNDRED_IN_WEI.multipliedBy(20).dividedBy(100),
      )
    ) {
      return new BigNumber(0)
    } else if (
      recipientBalance.isGreaterThan(
        HUNDRED_IN_WEI.multipliedBy(10).dividedBy(100),
      )
    ) {
      return nextAmount.dividedBy(4)
    } else if (
      recipientBalance.isGreaterThan(
        HUNDRED_IN_WEI.multipliedBy(5).dividedBy(100),
      )
    ) {
      return nextAmount.dividedBy(2)
    } else {
      return nextAmount
    }
  }
}

const HUNDRED_IN_WEI = new BigNumber('100000000000000000000')

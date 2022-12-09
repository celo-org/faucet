import { CeloTransactionObject } from '@celo/connect'
import BigNumber from "bignumber.js"
import { ContractKit, newKitFromWeb3 } from '@celo/contractkit'
import { StableToken, StableTokenInfo } from '@celo/contractkit/lib/celo-tokens'
import { ensureLeading0x, privateKeyToAddress } from '@celo/utils/lib/address'
import Web3 from 'web3'

export class CeloAdapter {
  public readonly defaultAddress: string
  public readonly kit: ContractKit
  private readonly privateKey: string

  constructor({ pk, nodeUrl }: { pk: string; nodeUrl: string }) {
    // To add more logging:
    // Use the debug of the contractkit. Run it with DEBUG=* (or the options)

    this.kit = newKitFromWeb3(new Web3(nodeUrl))
    console.info(`New kit from url: ${nodeUrl}`)
    this.privateKey = ensureLeading0x(pk)
    this.defaultAddress = privateKeyToAddress(this.privateKey)
    console.info(`Using address ${this.defaultAddress} to send transactions`)
    this.kit.connection.addAccount(this.privateKey)
    this.kit.connection.defaultAccount = this.defaultAddress
  }

  async transferGold(to: string, amount: string): Promise<CeloTransactionObject<boolean>> {
    const goldToken = await this.kit.contracts.getGoldToken()
    return goldToken.transfer(to, amount)
  }

  // TODO deprecate after deployment
  async transferDollars(to: string, amount: string): Promise<CeloTransactionObject<boolean>> {
    const stableToken = await this.kit.contracts.getStableToken()
    return stableToken.transfer(to, amount)
  }

  async transferStableTokens(to: string, amount: string) {
    return this.kit.celoTokens.forStableCeloToken(async (info: StableTokenInfo) => {
      const token = await this.kit.celoTokens.getWrapper(info.symbol as StableToken)
      const faucetBalance = await token.balanceOf(this.defaultAddress)

      if (faucetBalance.isLessThanOrEqualTo(amount)) {
        const exchangeContract = await this.kit.contracts.getContract(info.exchangeContract)
        const quote = await exchangeContract.quoteStableBuy(amount)
        const maxCeloToTrade = quote.multipliedBy(1.015)
        await this.increaseAllowanceIfNeeded(info, maxCeloToTrade as unknown as BigNumber)
        const tx = await exchangeContract.buyStable(amount, maxCeloToTrade)
        await tx.sendAndWaitForReceipt()
      }

      return token.transfer(to, amount)
    })
  }

  async increaseAllowanceIfNeeded(info: StableTokenInfo, amount: BigNumber) {

    const celoERC20Wrapper = await this.kit.contracts.getGoldToken()
    const exchangeContractAddress = await this.kit.registry.addressFor(info.exchangeContract)

    const allowance = await celoERC20Wrapper.allowance(this.defaultAddress, exchangeContractAddress)

    if (allowance.isLessThanOrEqualTo(amount)) {
      // multiply by 10 so we don't have to be setting this for every transaction
      const transaction = await celoERC20Wrapper.increaseAllowance(exchangeContractAddress, amount.multipliedBy(10))
      await transaction.sendAndWaitForReceipt()
    }
  }

  async escrowDollars(
    phoneHash: string,
    tempWallet: string,
    amount: string,
    expirySeconds: number,
    minAttestations: number
  ): Promise<CeloTransactionObject<boolean>> {
    const escrow = await this.kit.contracts.getEscrow()
    const stableToken = await this.kit.contracts.getStableToken()

    await stableToken.approve(escrow.address, amount).sendAndWaitForReceipt()
    return escrow.transfer(
      phoneHash,
      stableToken.address,
      amount,
      expirySeconds,
      tempWallet,
      minAttestations
    )
  }

  async getDollarsBalance(accountAddress: string = this.defaultAddress) {
    const stableToken = await this.kit.contracts.getStableToken()
    return stableToken.balanceOf(accountAddress)
  }

  async getGoldBalance(accountAddress: string = this.defaultAddress) {
    const goldToken = await this.kit.contracts.getStableToken()
    return goldToken.balanceOf(accountAddress)
  }

  stop() {
    this.kit.connection.stop()
  }
}

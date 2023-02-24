import { CeloTransactionObject } from '@celo/connect'
import { ContractKit, newKitFromWeb3 } from '@celo/contractkit'
import { StableToken, StableTokenInfo } from '@celo/contractkit/lib/celo-tokens'
import { ensureLeading0x, privateKeyToAddress } from '@celo/utils/lib/address'
import BigNumber from "bignumber.js"
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

  /*
   * @param amount -- amount is how many of the stable we will sell (in WEI)
   *
   */
  async convertExtraStablesToCelo(amount: string) {
    await this.kit.celoTokens.forStableCeloToken(async (info) => {
      try {
        console.log('converting', info.symbol)
        const stableToken = await this.kit.celoTokens.getWrapper(info.symbol as StableToken)
        const faucetBalance = await stableToken.balanceOf(this.defaultAddress)
        const MIN_BALANCE_IN_WEI = "25000000000000000000000" // 25K
        if (faucetBalance.isLessThan(new BigNumber(MIN_BALANCE_IN_WEI))) {
          console.log('skipping', info.symbol, faucetBalance.toString())
          return
        }
        const exchangeContract = await this.kit.contracts.getContract(info.exchangeContract)

        const [quote] = await Promise.all([
          exchangeContract.quoteStableSell(amount),
          stableToken.increaseAllowance(exchangeContract.address, amount).sendAndWaitForReceipt()
        ]);


        const tx = await exchangeContract.sellStable(amount, quote.multipliedBy(0.99).integerValue(BigNumber.ROUND_UP))
        await tx.sendAndWaitForReceipt()
      } catch (e) {
        console.info("caught", info.symbol, e)
      }
    })
  }

    /*
   * @param amount -- amount to transfer (unless balance of recipient is large enough to reduce gradually to zero)
   * @param to -- the recipient address
   * @param alwaysTransfer -- when false amount will be cut in half than quarter then zero determined by "to" balance of that token
   */
  async transferStableTokens(to: string, amount: string, alwaysTransfer: boolean = false) {
    return this.kit.celoTokens.forStableCeloToken(async (info: StableTokenInfo) => {
      const token = await this.kit.celoTokens.getWrapper(info.symbol as StableToken)
      const [faucetBalance, recipientBalance] = await Promise.all([
        token.balanceOf(this.defaultAddress),
        token.balanceOf(to)
      ])


      const realAmount = this.fadeOutAmount(recipientBalance, amount, alwaysTransfer)

      if (realAmount.eq(0)) {
        console.info(`skipping ${info.symbol} for ${to} balance already ${recipientBalance.toString()}`)
        return false
      }
      console.info(`sending ${to} ${realAmount.toString()}${info.symbol}. Balance ${recipientBalance.toString()}`)


      if (faucetBalance.isLessThanOrEqualTo(realAmount)) {
        const exchangeContract = await this.kit.contracts.getContract(info.exchangeContract)

        // this surprised me but if you want to send CELO and receive an Amount of stable, quoteGoldBuy is the function to call not quoteStableBuy
        const celoBuyquote = await exchangeContract.quoteGoldBuy(realAmount)

        const maxCeloToTrade = celoBuyquote.multipliedBy(1.05).integerValue(BigNumber.ROUND_UP)
        await this.increaseAllowanceIfNeeded(info, maxCeloToTrade as unknown as BigNumber)

        await exchangeContract.buyStable(realAmount, maxCeloToTrade).sendAndWaitForReceipt()
      }

      return token.transfer(to, realAmount.toString())
    })
  }

  async increaseAllowanceIfNeeded(info: StableTokenInfo, amount: BigNumber) {

    const celoERC20Wrapper = await this.kit.contracts.getGoldToken()
    const exchangeContractAddress = await this.kit.registry.addressFor(info.exchangeContract)

    const allowance = await celoERC20Wrapper.allowance(this.defaultAddress, exchangeContractAddress)
    if (allowance.isLessThanOrEqualTo(amount)) {
      // multiply by 10 so we don't have to be setting this for every transaction
      const transaction = await celoERC20Wrapper.increaseAllowance(exchangeContractAddress, amount.multipliedBy(10).integerValue(BigNumber.ROUND_UP))
      const receipt = await transaction.sendAndWaitForReceipt()
      console.log('increasedAllowance', receipt.transactionHash)
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

  async getDollarsBalance(accountAddress: string = this.defaultAddress): Promise<BigNumber> {
    const stableToken = await this.kit.contracts.getStableToken()
    return stableToken.balanceOf(accountAddress) as unknown as Promise<BigNumber>
  }

  async getGoldBalance(accountAddress: string = this.defaultAddress): Promise<BigNumber> {
    const goldToken = await this.kit.contracts.getStableToken()
    return goldToken.balanceOf(accountAddress)  as unknown as Promise<BigNumber>
  }

  stop() {
    this.kit.connection.stop()
  }

  // prevent accounts which already have many tokens from gaining more
  // This is to prevent abuse on the faucet which is intended for small amounts
  fadeOutAmount(recipientBalance: BigNumber, amount: string, useGivenAmount: boolean) {
    const nextAmount = new BigNumber(amount)

    if (useGivenAmount) {
      return nextAmount
    } else if (recipientBalance.isGreaterThan(HUNDRED_IN_WIE.multipliedBy(1.5))) {
      return new BigNumber(0)
    } else if (recipientBalance.isGreaterThan(HUNDRED_IN_WIE.multipliedBy(1))) {
      return nextAmount.dividedBy(2)
    } else if (recipientBalance.isGreaterThan(HUNDRED_IN_WIE.multipliedBy(0.5))) {
      return nextAmount.dividedBy(4)
    } else {
      return nextAmount
    }
  }
}

const HUNDRED_IN_WIE = new BigNumber("100000000000000000000")
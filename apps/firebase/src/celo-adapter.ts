import { CeloTransactionObject } from '@celo/connect'
import { ContractKit, newKitFromWeb3, Token } from '@celo/contractkit'
import { StableToken, StableTokenInfo } from '@celo/contractkit/lib/celo-tokens'
import { ensureLeading0x, privateKeyToAddress } from '@celo/utils/lib/address'
import { Mento } from '@mento-protocol/mento-sdk'
import BigNumber from 'bignumber.js'
import { providers, Signer, Wallet } from 'ethers'
import Web3 from 'web3'

export class CeloAdapter {
  public readonly defaultAddress: string
  public readonly kit: ContractKit
  private readonly etherProvider: providers.JsonRpcProvider
  private readonly signer: Signer
  private readonly privateKey: string
  private mento: Mento | undefined
  private initialized: boolean = false

  constructor({ pk, nodeUrl }: { pk: string; nodeUrl: string }) {
    this.etherProvider = new providers.JsonRpcProvider(nodeUrl)
    this.signer = new Wallet(pk, this.etherProvider)

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

  async init() {
    if (this.initialized) {
      return true
    }
    this.mento = await Mento.create(this.signer)
    this.initialized = true
    return true
  }

  async transferGold(
    to: string,
    amount: string
  ): Promise<CeloTransactionObject<boolean>> {
    const goldToken = await this.kit.contracts.getGoldToken()
    return goldToken.transfer(to, amount)
  }

  /*
   * @param amount -- amount is how many of the stable we will sell (in WEI)
   *
   */
  async convertExtraStablesToCelo(amount: string) {
    const mento = this.mento
    if (!mento) {
      throw new Error('Must call init() first')
    }
    const celoContractAddress = await this.kit.celoTokens.getAddress(Token.CELO)
    await this.kit.celoTokens.forStableCeloToken(async (info) => {
      try {
        const stableToken = await this.kit.celoTokens.getWrapper(
          info.symbol as StableToken
        )
        const faucetBalance = await stableToken.balanceOf(this.defaultAddress)
        const MIN_BALANCE_IN_WEI = '25000000000000000000000' // 25K
        if (faucetBalance.isLessThan(new BigNumber(MIN_BALANCE_IN_WEI))) {
          console.log('skipping', info.symbol, faucetBalance.toString())
          return
        }
        console.log('converting', info.symbol)

        const allowanceTxObj = await mento.increaseTradingAllowance(
          stableToken.address,
          amount
        )

        const allowanceTx = await this.signer.sendTransaction(allowanceTxObj)
        await allowanceTx.wait()

        const quoteAmountOut = await mento.getAmountOut(
          stableToken.address,
          celoContractAddress,
          amount
        )
        const expectedAmountOut = quoteAmountOut.mul(99).div(100) // allow 1% slippage from quote
        const swapTxObj = await mento.swapIn(
          stableToken.address,
          celoContractAddress,
          amount,
          expectedAmountOut
        )
        const swapTx = await this.signer.sendTransaction(swapTxObj)
        return swapTx.wait()
      } catch (e) {
        console.info('caught', info.symbol, e)
      }
    })
  }

  /*
   * @param amount -- amount to transfer (unless balance of recipient is large enough to reduce gradually to zero)
   * @param to -- the recipient address
   * @param alwaysTransfer -- when false amount will be cut in half than quarter then zero determined by "to" balance of that token
   */
  async transferStableTokens(
    to: string,
    amount: string,
    alwaysTransfer: boolean = false
  ) {
    const mento = this.mento
    if (!mento) {
      throw new Error('Must call init() first')
    }
    const celoToken = await this.kit.contracts.getGoldToken()

    return this.kit.celoTokens.forStableCeloToken(
      async (info: StableTokenInfo) => {
        const token = await this.kit.celoTokens.getWrapper(
          info.symbol as StableToken
        )
        const [faucetBalance, recipientBalance] = await Promise.all([
          token.balanceOf(this.defaultAddress),
          token.balanceOf(to),
        ])

        const stableTokenAddr = token.address

        const realAmount = this.fadeOutAmount(
          recipientBalance,
          amount,
          alwaysTransfer
        )

        if (realAmount.eq(0)) {
          console.info(
            `skipping ${
              info.symbol
            } for ${to} balance already ${recipientBalance.toString()}`
          )
          return false
        }
        console.info(
          `sending ${to} ${realAmount.toString()}${
            info.symbol
          }. Balance ${recipientBalance.toString()}`
        )

        if (faucetBalance.isLessThanOrEqualTo(realAmount)) {
          const quoteAmountIn = await mento.getAmountIn(
            celoToken.address,
            stableTokenAddr,
            realAmount.toString()
          )
          console.info(
            `swap quote ${quoteAmountIn.toString()} for ${realAmount.toString()} `
          )
          const maxCeloToTrade = quoteAmountIn.div(100).mul(103).toString() // 3% slippage
          await this.increaseAllowanceIfNeeded(new BigNumber(maxCeloToTrade))

          const swapTxObj = await mento.swapOut(
            celoToken.address,
            stableTokenAddr,
            realAmount.toString(),
            maxCeloToTrade.toString()
          )
          console.info('swap TX', swapTxObj)
          await this.signer.sendTransaction(swapTxObj)
        }

        return token.transfer(to, realAmount.toString())
      }
    )
  }

  async increaseAllowanceIfNeeded(amount: BigNumber) {
    const mento = this.mento
    if (!mento) {
      throw new Error('Must call init() first')
    }

    const celoERC20Wrapper = await this.kit.contracts.getGoldToken()
    const brokerContractAddress = '0xD3Dff18E465bCa6241A244144765b4421Ac14D09' // https://docs.mento.org/mento-protocol/developers/deployment-addresses

    const allowance = await celoERC20Wrapper.allowance(
      this.defaultAddress,
      brokerContractAddress
    )
    if (allowance.isLessThanOrEqualTo(amount)) {
      // multiply by 10 so we don't have to be setting this for every transaction
      const allowanceTxObj = await mento.increaseTradingAllowance(
        celoERC20Wrapper.address,
        amount.multipliedBy(10).integerValue(BigNumber.ROUND_UP).toString()
      )
      const allowanceTx = await this.signer.sendTransaction(allowanceTxObj)
      const allowanceReceipt = await allowanceTx.wait()

      console.log('increasedAllowance', allowanceReceipt?.transactionHash)
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

  async getDollarsBalance(
    accountAddress: string = this.defaultAddress
  ): Promise<BigNumber> {
    const stableToken = await this.kit.contracts.getStableToken()
    return stableToken.balanceOf(
      accountAddress
    ) as unknown as Promise<BigNumber>
  }

  async getGoldBalance(
    accountAddress: string = this.defaultAddress
  ): Promise<BigNumber> {
    const goldToken = await this.kit.contracts.getGoldToken()
    return goldToken.balanceOf(accountAddress) as unknown as Promise<BigNumber>
  }

  stop() {
    this.kit.connection.stop()
  }

  // prevent accounts which already have many tokens from gaining more
  // This is to prevent abuse on the faucet which is intended for small amounts
  fadeOutAmount(
    recipientBalance: BigNumber,
    amount: string,
    useGivenAmount: boolean
  ) {
    const nextAmount = new BigNumber(amount)

    if (useGivenAmount) {
      return nextAmount
    } else if (
      recipientBalance.isGreaterThan(
        HUNDRED_IN_WIE.multipliedBy(75).dividedBy(100)
      )
    ) {
      return new BigNumber(0)
    } else if (
      recipientBalance.isGreaterThan(
        HUNDRED_IN_WIE.multipliedBy(50).dividedBy(100)
      )
    ) {
      return nextAmount.dividedBy(4)
    } else if (
      recipientBalance.isGreaterThan(
        HUNDRED_IN_WIE.multipliedBy(25).dividedBy(100)
      )
    ) {
      return nextAmount.dividedBy(2)
    } else {
      return nextAmount
    }
  }
}

const HUNDRED_IN_WIE = new BigNumber('100000000000000000000')

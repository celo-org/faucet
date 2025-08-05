
import { Account, Address, createWalletClient, Hex, http, Transport, WalletClient } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { celoAlfajores, celoSepolia } from 'viem/chains'

export class CeloAdapter {
  public readonly client: WalletClient<Transport, typeof celoAlfajores | typeof celoSepolia, Account>
  private readonly chain: typeof celoAlfajores | typeof celoSepolia

  constructor({ pk, nodeUrl }: { pk: Hex; nodeUrl: string }) {
    const account = privateKeyToAccount(pk)
    this.chain = nodeUrl.includes('alfajores') ? celoAlfajores : celoSepolia
    this.client = createWalletClient({
      account,
      transport: http(nodeUrl),
      chain: this.chain

    })
    console.info(`New client from url: ${nodeUrl}`)
    console.info(`Using address ${account.address} to send transactions`)
  }

  async transferCelo(
    to: Address,
    amount: bigint,
  ): Promise<Hex> {
    const txHash = await this.client.sendTransaction({
      to,
      value: amount,
      chain: this.chain,
    })
    return txHash
  }


}

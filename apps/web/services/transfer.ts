import { isUsingNewFaucetService, NEW_CHAINS } from 'config/chains';
import { getQualifiedValue } from 'services/qualifiers';
import { AuthLevel } from 'types';
import { Address, createWalletClient, extractChain, Hex, http } from 'viem';
import { waitForTransactionReceipt } from 'viem/_types/actions/public/waitForTransactionReceipt';
import { privateKeyToAccount } from 'viem/accounts';
import { Chain } from 'viem/chains';


/**
 * Transfers funds to a specified address on the given blockchain.
 *
 * @param request - The request object containing the recipient address and value to transfer.
 * @param chain - The blockchain chain on which the transaction will be executed.
 * @returns A promise that resolves to the transaction hash of the transfer.
 * @throws Will throw an error if the PRIVATE_KEY environment variable is not set or if the value to transfer is not greater than zero.
 */
export async function tranferFunds(
  request: { to: Address; value: bigint },
  chain: Chain
): Promise<{ hash: Hex; status: "success" | "reverted" }> {

  if (!request.to || !request.value) {
    throw new Error('to and value are required fields')
  }
  if (request.value <= BigInt(0)) {
    throw new Error('value must be greater than zero')
  }

  if (!process.env.PRIVATE_KEY) {
    throw new Error('PRIVATE_KEY environment variable is not set')
  }
  const account = privateKeyToAccount(process.env.PRIVATE_KEY as Hex)
  const walletClient = createWalletClient({
    chain,
    transport: http(),
    account: account
  })

  console.time('sendTransaction')
  const txRequest = await  walletClient.prepareTransactionRequest({
    to: request.to,
    chain,
    value: request.value,
  })

  const hash = await walletClient.sendTransaction(txRequest)
  console.timeEnd('sendTransaction')
  console.time('waitForTransactionReceipt')
  const receipt = await waitForTransactionReceipt(walletClient, { hash })
  console.timeEnd('waitForTransactionReceipt')
  console.debug('Transaction receipt:', receipt)
  return {hash, status: receipt.status}
}

export type TransferRequest = {
  to: Address;
  value: bigint;
  chain: Chain;
};

export async function prepareTransfer(to: Address, chainId: number, authLevel: AuthLevel): Promise<TransferRequest> {
  
  const value = await getQualifiedValue(to, authLevel);
  const chain  = determineChain(chainId);

  return { to, value, chain };
}


const determineChain = (chainId: number) => {
  if (!isUsingNewFaucetService(chainId)) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }
  // ADD other chains as we support them
  return extractChain({ chains: NEW_CHAINS, id: chainId });
}
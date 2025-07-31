import { inter } from 'components/request-form';
import { CHAIN_PARAMS } from 'config/chains';
import { Network } from 'types';

// TODO add wagmi and waitForTxReceipt, while waiting show "pending" then only after show 

export const TxMessage = ({
  txHash, network,
}: {
  txHash?: string | null;
  network: Network;
}) => {
  if (!txHash) {
    return null;
  }
  if (txHash === 'skipped') {
    return (
      <span className={inter.className}>
        No celo was transferred as the account already has a large celo balance.
      </span>
    );
  }
  const explorerUrl = new URL(CHAIN_PARAMS[network].blockExplorerUrls[0])
  return (
    <a
      className={inter.className}
      target="_blank"
      rel="noreferrer"
      href={`${explorerUrl.origin}/tx/${txHash}`}
    >
      View on Celo Explorer
    </a>
  );
};

import { forceNonce, getNonce } from 'services/redis';
import { NonceManagerSource } from 'viem';
import { createNonceManager, jsonRpc } from 'viem/nonce';

export const nonceManager = createNonceManager({
  source: nonceSource()
});

const jsonRPCSource: NonceManagerSource = jsonRpc();


function nonceSource(): NonceManagerSource {
  return {
    async get({ address, chainId, client }) {
      async function getOnChainNonce() {
        console.time('getOnChainNonce');
        const result = await jsonRPCSource.get({ address, chainId, client });
        console.timeEnd('getOnChainNonce');
        return result;
      }
      const [onChainNonce, offChainNonce] = await Promise.all([
        getOnChainNonce(),
        getNonce(chainId, address)
      ]);
      // offchain nonce will probably be correct but at minimum will be equal to the onchain nonce
      if (offChainNonce === null || offChainNonce < onChainNonce) {
        forceNonce(chainId, address, onChainNonce+1);
      }

      console.debug(`getNonce: onChainNonce=${onChainNonce}, offChainNonce=${offChainNonce}`);
      return Math.max(onChainNonce+1, offChainNonce ?? 0);
    },
    async set({ address, chainId }, nonce: number) {
      console.debug(`setNonce: chainId=${chainId}, address=${address}, nonce=${nonce}`);
    },
  };
}


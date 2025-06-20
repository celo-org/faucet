import { farcasterFrame } from "@farcaster/frame-wagmi-connector";
import { createConfig, http } from "wagmi";
import { base, celo, mainnet } from "wagmi/chains";

export const config = createConfig({
  chains: [base,celo, mainnet],
  connectors: [farcasterFrame()],
  transports: {
    [base.id]: http(),
    [celo.id]: http(),
    [mainnet.id]: http(),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}

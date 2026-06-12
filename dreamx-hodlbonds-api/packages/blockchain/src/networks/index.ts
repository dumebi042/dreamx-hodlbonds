import { avalanche, avalancheFuji, sepolia, type Chain } from "viem/chains"

export const chainIds = [43114, 43113, 11155111] as const
export type ChainId = (typeof chainIds)[number]

export const networks: { [key in ChainId]: Chain } = {
  43114: avalanche,
  43113: {
    ...avalancheFuji,
    rpcUrls: { default: { http: ["https://avalanche-fuji-c-chain-rpc.publicnode.com/"] } },
  },
  11155111: { ...sepolia, rpcUrls: { default: { http: ["https://sepolia.drpc.org"] } } },
}

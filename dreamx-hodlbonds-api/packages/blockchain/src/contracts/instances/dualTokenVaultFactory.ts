import { dualTokenVaultFactoryAbi } from "../abis/dualTokenVaultFactoryAbi"
import { createContract } from "../utils"

export const dualTokenVaultFactory = createContract({
  name: "Dual Token Vault Factory",
  abi: dualTokenVaultFactoryAbi,
  addresses: {
    "43113": "0x7a61b563c0604eC251b11B86e9eFB7D0f73B4D9d", // LFJ Factory
  },
})

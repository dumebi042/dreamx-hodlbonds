import { vaultFactoryAbi } from "../abis/vaultFactoryAbi"
import { createContract } from "../utils"

export const vaultFactory = createContract({
  name: "VaultFactory",
  abi: vaultFactoryAbi,
  addresses: {
    "43113": "0xAc607665BF50892aa72A21594F8B99b19c87aEb8", // LFJ Factory
    // '43113': '0x5660bD0CC82F0b68C4A33ba85D2d8635a471CbAa', // Blackhole Factory
    "11155111": "0xF684cBc05CFBE076a8E3Bd58B67CEeaEaE3b682C",
  },
})

import { dualTokenVaultAbi } from "../abis/dualTokenVaultAbi"
import { createFactoryInstance } from "../utils"

export const dualTokenVault = createFactoryInstance({
  name: "Dual Token Vault Instance",
  abi: dualTokenVaultAbi,
})

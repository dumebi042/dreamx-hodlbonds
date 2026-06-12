import { vaultAbi } from "../abis/vaultAbi"
import { createFactoryInstance } from "../utils"

export const vault = createFactoryInstance({
  name: "Vault Instance",
  abi: vaultAbi,
})

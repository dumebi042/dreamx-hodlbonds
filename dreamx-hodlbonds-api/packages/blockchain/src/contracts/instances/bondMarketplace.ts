import { bondMarketplaceAbi } from "../abis/bondMarketplace"
import { createContract } from "../utils"

export const bondMarketplace = createContract({
  name: "Bond Marketplace",
  abi: bondMarketplaceAbi,
  addresses: {
    // "43113": "0x7a61b563c0604eC251b11B86e9eFB7D0f73B4D9d",
  },
})

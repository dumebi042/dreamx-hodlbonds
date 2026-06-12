import { lbPairAbi } from "../abis/lbPairAbi"
import { createFactoryInstance } from "../utils"

export const lbPair = createFactoryInstance({
  name: "LBPair",
  abi: lbPairAbi,
})

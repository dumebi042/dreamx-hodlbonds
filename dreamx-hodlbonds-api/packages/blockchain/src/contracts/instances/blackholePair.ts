import { blackholePairAbi } from "../abis/blackholePairAbi"
import { createFactoryInstance } from "../utils"

export const blackholePair = createFactoryInstance({
  name: "BlackholePair",
  abi: blackholePairAbi,
})

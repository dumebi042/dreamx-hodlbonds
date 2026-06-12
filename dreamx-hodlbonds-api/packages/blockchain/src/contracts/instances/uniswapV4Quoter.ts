import { uniswapV4QuoterAbi } from "../abis/uniswapV4QuoterAbi"
import { createContract } from "../utils"

export const uniswapV4Quoter = createContract({
  name: "UniswapV4Quoter",
  abi: uniswapV4QuoterAbi,
  addresses: {
    "43114": "0xbe40675bb704506a3c2ccfb762dcfd1e979845c2",
    "11155111": "0x61b3f2011a92d183c7dbadbda940a7555ccf9227",
  },
})

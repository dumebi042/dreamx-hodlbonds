import { algebraQuoterV2Abi } from "../abis/algebraQuoterV2Abi"
import { createContract } from "../utils"

export const algebraQuoterV2 = createContract({
  name: "AlgebraQuoterV2",
  abi: algebraQuoterV2Abi,
  addresses: {
    "43114": "0x3e182bcf14Be6142b9217847ec1112e3c39Eb689", // Avalanche C-Chain
    "43113": "0x74Ff66609d9b2237A86241B2CF453fE4D5728F11", // Fuji Testnet
  },
})

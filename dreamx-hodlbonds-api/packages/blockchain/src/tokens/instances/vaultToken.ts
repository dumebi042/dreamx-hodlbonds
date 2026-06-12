import { vaultTokenAbi } from "../../contracts/abis/vaultTokenAbi"
import { createERC20 } from "../utils/create-erc20"

export const vaultToken = createERC20<typeof vaultTokenAbi>(
  {
    name: "Generic Stable Token",
    symbol: "GST",
    decimals: 18,
    addresses: {
      "43113": "0x7ff20782ECEC768D43b96c4232e68582d447A3A7",
      "11155111": "0x8a0D86c6835B9Ed3c6a0102a094E778BcE58dAA6",
    },
  },
  vaultTokenAbi,
)

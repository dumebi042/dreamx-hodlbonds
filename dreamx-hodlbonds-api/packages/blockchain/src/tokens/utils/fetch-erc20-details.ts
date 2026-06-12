import { erc20Abi, type Address } from "viem"

import type { ChainId } from "../../networks"
import type { Token } from "../types"

import { clients } from "../../clients"
import { createERC20 } from "./create-erc20"

export async function fetchErc20Details(
  address: Address,
  chainId: ChainId,
): Promise<Token<typeof erc20Abi> | null> {
  const client = clients[chainId]
  const erc20Base = { address, abi: erc20Abi } as const

  try {
    const results = await client.multicall({
      contracts: [
        {
          ...erc20Base,
          functionName: "name",
          args: [],
        },
        {
          ...erc20Base,
          functionName: "symbol",
          args: [],
        },
        {
          ...erc20Base,
          functionName: "decimals",
          args: [],
        },
      ],
      allowFailure: false,
    })
    const [name, symbol, decimals] = results
    const token = createERC20({
      name,
      symbol,
      decimals,
      addresses: {
        [chainId]: address,
      },
    })
    return token
  } catch (error) {
    console.error("Error fetching ERC20 details:", error)
    return null
  }
}

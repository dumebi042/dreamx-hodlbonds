import { erc20Abi, formatUnits, getContract, parseUnits, type Abi } from "viem"

import type { ChainId } from "../../networks"
import type { Token, TokenBase } from "../types"

import { clients } from "../../clients"

export function createERC20(tokenBase: TokenBase): Token<typeof erc20Abi>
export function createERC20<TAbi extends Abi>(tokenBase: TokenBase, abi: TAbi): Token<TAbi>
export function createERC20<TAbi extends Abi = typeof erc20Abi>(
  tokenBase: TokenBase,
  abi?: TAbi,
): Token<TAbi> {
  const { name, symbol, decimals, addresses, balance } = tokenBase
  const actualAbi = (abi ?? erc20Abi) as TAbi

  return {
    name,
    symbol,
    decimals,
    addresses,
    balance,
    type: "ERC20",
    address: (chainId: ChainId) => {
      const address = addresses[chainId]
      if (!address) throw new Error(`${name} not deployed on chainId ${chainId}`)
      return address
    },
    contract: (chainId: ChainId) => {
      const client = clients[chainId]
      const address = addresses[chainId]
      if (!address)
        throw new Error(`${name} contract not deployed on ${client.chain.name} (${chainId})`)
      return getContract({ address, abi: actualAbi, client })
    },
    format(value: bigint) {
      return formatUnits(value, this.decimals)
    },
    parse(value: string) {
      return parseUnits(value, this.decimals)
    },
  } as Token<TAbi>
}

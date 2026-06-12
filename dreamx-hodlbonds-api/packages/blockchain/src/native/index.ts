import { formatUnits, parseUnits, zeroAddress, type Address } from "viem"

import type { ChainId } from "../networks"
import type { NativeToken } from "../tokens/types"

import { clients } from "../clients"

export const native = (chainId: ChainId): NativeToken => {
  const client = clients[chainId]
  if (!client) {
    throw new Error(`No client configured for chainId ${chainId}`)
  }
  const { name, decimals, symbol } = client.chain.nativeCurrency

  return {
    name,
    symbol,
    decimals,
    addresses: Object.entries(clients).reduce(
      (acc, [id]) => {
        acc[Number(id) as ChainId] = zeroAddress
        return acc
      },
      {} as Record<ChainId, Address>,
    ),
    type: "NATIVE",
    address: (chainId: ChainId) => {
      const client = clients[chainId]
      if (!client) throw new Error(`No client configured for chainId ${chainId}`)
      return zeroAddress
    },
    getBalance: async (address: Address) => await client.getBalance({ address }),
    format(value: bigint) {
      return formatUnits(value, this.decimals)
    },
    parse(value: string) {
      return parseUnits(value, this.decimals)
    },
  }
}

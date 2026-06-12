import { getContract, type Abi, type Address } from "viem"

import type { ChainId } from "../networks"
import type { ContractDetails, FactoryInstanceDetails } from "./types"

import { clients } from "../clients"

export function createContract<TAbi extends Abi>(options: {
  name: string
  abi: TAbi
  addresses: Partial<Record<ChainId, Address>>
}): ContractDetails<TAbi> {
  const { name, abi, addresses } = options
  return {
    name,
    abi,
    addresses,
    contract: (chainId: ChainId) => {
      const client = clients[chainId]
      const address = addresses[chainId]
      if (!address)
        throw new Error(`${name} contract not deployed on ${client.chain.name} (${chainId})`)
      return getContract({ address, abi, client })
    },
  } as const
}

export function createFactoryInstance<TAbi extends Abi>(options: {
  name: string
  abi: TAbi
}): FactoryInstanceDetails<TAbi> {
  const { name, abi } = options
  return {
    name,
    abi,
    contract: (chainId: ChainId, address: Address) => {
      const client = clients[chainId]
      if (!address)
        throw new Error(`${name} contract not deployed on ${client.chain.name} (${chainId})`)
      return getContract({ address, abi, client })
    },
  } as const
}

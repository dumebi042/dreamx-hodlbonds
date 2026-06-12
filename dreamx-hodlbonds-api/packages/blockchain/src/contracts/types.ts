import { getContract, type Abi, type Address, type Transport } from "viem"

import type { Client } from "../clients"
import type { ChainId } from "../networks"

import { algebraQuoterV2 } from "./instances/algebraQuoterV2"
import { blackholePair } from "./instances/blackholePair"
import { chainlinkPriceFeed } from "./instances/chainlinkPriceFeed"
import { dualTokenVault } from "./instances/dualTokenVault"
import { dualTokenVaultFactory } from "./instances/dualTokenVaultFactory"
import { lbPair } from "./instances/lbPair"
import { uniswapV4Quoter } from "./instances/uniswapV4Quoter"
import { vault } from "./instances/vault"
import { vaultFactory } from "./instances/vaultFactory"

export type ContractDetails<T extends Abi> = {
  name: string
  abi: T
  addresses: Partial<Record<ChainId, Address>>
  contract: (chainId: ChainId) => ReturnType<typeof getContract<Transport, Address, T, Client>>
}

export type FactoryInstanceDetails<T extends Abi> = {
  name: string
  abi: T
  contract: (
    chainId: ChainId,
    address: Address,
  ) => ReturnType<typeof getContract<Transport, Address, T, Client>>
}

export const contractMap = {
  vault,
  vaultFactory,
  dualTokenVault,
  dualTokenVaultFactory,
  algebraQuoterV2,
  blackholePair,
  chainlinkPriceFeed,
  lbPair,
  uniswapV4Quoter,
  // ... other contracts
} as const

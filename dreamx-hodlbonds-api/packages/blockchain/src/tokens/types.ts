import type { Abi, Address, Client, getContract, Transport, zeroAddress } from "viem"

import type { ChainId } from "../networks"

export interface TokenBase {
  name: string
  symbol: string
  decimals: number
  addresses: Partial<Record<ChainId, Address>>
  balance?: bigint
}

export interface Token<TAbi extends Abi = Abi> extends TokenBase {
  type: "ERC20"
  address: (chainId: ChainId) => Address
  contract: (chainId: ChainId) => ReturnType<typeof getContract<Transport, Address, TAbi, Client>>
  format: (value: bigint) => string
  parse: (value: string) => bigint
}

export interface NativeToken extends TokenBase {
  type: "NATIVE"
  address: (chainId: ChainId) => typeof zeroAddress
  getBalance: (address: Address) => Promise<bigint>
  format: (value: bigint) => string
  parse: (value: string) => bigint
}

const tokens = ["vaultToken"] as const
type Tokens = (typeof tokens)[number]
export type TokenMap = Record<Tokens, Token<any>>

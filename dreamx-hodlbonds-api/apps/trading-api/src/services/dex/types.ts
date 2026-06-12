import type { ChainId } from "@hodlbonds-api/blockchain"
import type { NativeToken, Token } from "@hodlbonds-api/blockchain"
import type { Address, erc20Abi } from "viem"

import type { CreateOrderBody } from "@/schemas"
import type { BlackholePoolConfig, LFJPoolConfig, UniswapPoolConfig } from "@/types"

export enum DexType {
  UNISWAP_V4 = "uniswap-v4",
  LFJ = "lfj",
  BLACKHOLE = "blackhole",
}

// Union type of all possible DEX configs
export type PoolConfig = UniswapPoolConfig | BlackholePoolConfig | LFJPoolConfig
export type PoolToken = Token<typeof erc20Abi> | NativeToken

export interface TradeConfig extends CreateOrderBody {
  chainId: ChainId
}

export type DexQuoteResult = {
  expectedOutput: bigint
  minAmountOut: bigint
  priceImpact?: string
}

export type DexSwapParams = {
  minAmountOut: bigint
  deadline: bigint
}

export type DexSimulateParams = DexSwapParams

/**
 * Base interface for DEX adapters. Each adapter is initialized with its specific config.
 */
export interface DexAdapter<TPoolConfig extends PoolConfig = PoolConfig> {
  readonly name: string
  readonly poolConfig: TPoolConfig
  readonly tradeConfig: TradeConfig
  readonly inputToken: PoolToken
  readonly outputToken: PoolToken
  getQuote(): Promise<DexQuoteResult>
  simulateSwap(params: DexSimulateParams): Promise<void>
  executeSwap(params: DexSwapParams): Promise<string>
}

export type DexSelection = {
  type: DexType
  config: LFJPoolConfig | BlackholePoolConfig
}

export type SwapContext = {
  chainId: ChainId
  vaultAddress: `0x${string}`
  side: "buy" | "sell"
  size: string
  vaultToken: PoolToken
  stableToken: PoolToken
  chainlinkPriceOracleAddress?: Address
  wrappedNativeTokenAddress?: Address
}

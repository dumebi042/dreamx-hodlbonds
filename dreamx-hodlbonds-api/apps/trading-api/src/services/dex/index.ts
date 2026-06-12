import type { BlackholePoolConfig, LFJPoolConfig, UniswapPoolConfig } from "@/types"

import { errors } from "@/lib/errors"

import type { DexAdapter, DexSelection, PoolConfig, PoolToken, TradeConfig } from "./types"

import { BlackholeAdapter } from "./blackhole"
import { LFJAdapter } from "./lfj"
import { DexType } from "./types"
import { UniswapV4Adapter } from "./uniswap-v4"

/**
 * Factory function to get the appropriate DEX adapter with its config
 */
export function getDexAdapter(
  dexType: DexType,
  poolConfig: PoolConfig,
  tradeConfig: TradeConfig,
  vaultToken: PoolToken,
  stableToken: PoolToken,
  wrappedNativeTokenAddress?: `0x${string}`,
): DexAdapter {
  switch (dexType) {
    case DexType.UNISWAP_V4:
      return new UniswapV4Adapter(
        poolConfig as UniswapPoolConfig,
        tradeConfig,
        vaultToken,
        stableToken,
      )
    case DexType.LFJ:
      return new LFJAdapter(
        poolConfig as LFJPoolConfig,
        tradeConfig,
        vaultToken,
        stableToken,
        wrappedNativeTokenAddress,
      )
    case DexType.BLACKHOLE:
      return new BlackholeAdapter(
        poolConfig as BlackholePoolConfig,
        tradeConfig,
        vaultToken,
        stableToken,
      )
    default:
      throw new Error(`Unsupported DEX type: ${dexType}`)
  }
}

/**
 * Input for getDexSelections
 */
export interface DexSelectionsInput {
  primaryDex: "LFJ" | "BLACKHOLE"
  pool?: {
    lfj?: LFJPoolConfig
    blackhole?: BlackholePoolConfig
  }
}

/**
 * Determines primary and backup DEX from vault data.
 * Returns null for backup if the config is not available.
 */
export function getDexSelections(data: DexSelectionsInput): {
  primary: DexSelection
  backup: DexSelection | null
} {
  const isPrimaryLFJ = data.primaryDex === "LFJ"

  // Validate primary config exists
  const primaryConfig = isPrimaryLFJ ? data.pool?.lfj : data.pool?.blackhole
  if (!primaryConfig) {
    throw errors.internal(`Primary DEX config missing for ${data.primaryDex}`)
  }

  const primary: DexSelection = isPrimaryLFJ
    ? { type: DexType.LFJ, config: primaryConfig as LFJPoolConfig }
    : { type: DexType.BLACKHOLE, config: primaryConfig as BlackholePoolConfig }

  // Backup is the other DEX (if config exists)
  const backupConfig = isPrimaryLFJ ? data.pool?.blackhole : data.pool?.lfj
  const backup: DexSelection | null = backupConfig
    ? isPrimaryLFJ
      ? { type: DexType.BLACKHOLE, config: backupConfig as BlackholePoolConfig }
      : { type: DexType.LFJ, config: backupConfig as LFJPoolConfig }
    : null

  return { primary, backup }
}

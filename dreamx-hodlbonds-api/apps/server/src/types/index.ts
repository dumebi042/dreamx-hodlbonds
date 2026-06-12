import * as z from "zod"

import type { DexSchema, PoolTokenSchema, ReceiptTokenSchema } from "@/schemas"

export const VAULT_STATUS = [
  "BOND_SALE",
  "TRADING",
  "FUNDING",
  "CLAIM",
  "SETTLED",
  "CANCELLED",
  "UNKNOWN",
] as const
type VaultState = (typeof VAULT_STATUS)[number]
export const vaultStateToString = (value: number): VaultState => VAULT_STATUS[value] ?? "UNKNOWN"

// export const TRADING_STRATEGY = ['NONE', 'CONSERVATIVE', 'BALANCED', 'AGGRESSIVE'] as const
// export type TradingStrategy = (typeof TRADING_STRATEGY)[number]
// export const tradingStrategyToString = (value: number): TradingStrategy => TRADING_STRATEGY[value]!

const PRIMARY_DEX = ["LFJ", "BLACKHOLE"] as const
export type PrimaryDex = (typeof PRIMARY_DEX)[number]
export const primaryDexToString = (value: number): PrimaryDex => PRIMARY_DEX[value]!

export type PoolTokenDetails = z.infer<typeof PoolTokenSchema>
export type ReceiptToken = z.infer<typeof ReceiptTokenSchema>
export type DexDetails = z.infer<typeof DexSchema>

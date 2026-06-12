import * as z from "zod"

import type {
  BlackholePoolConfigSchema,
  VaultBlockchainSchema,
  VaultSchema,
  VaultsResponseSchema,
  TokenSchema,
  LFJPoolConfigSchema,
  UniswapPoolConfigSchema,
  OrderSideSchema,
  TradeRequestStatusSchema,
  ListOrdersQuerySchema,
  OrderListResponseSchema,
  OrderStatusResponseSchema,
} from "@/schemas"

const CONTRACT_VAULT_STATUS = ["BOND_ISSUANCE", "TRADING", "SETTLED"] as const
export type ContractVaultState = (typeof CONTRACT_VAULT_STATUS)[number]
export const vaultStateToString = (value: number): ContractVaultState =>
  CONTRACT_VAULT_STATUS[value] ?? "BOND_ISSUANCE"
export const VAULT_STATUS = ["BOND_ISSUANCE", "TRADING", "HARVESTING", "CLAIM", "SETTLED"] as const
export type VaultState = (typeof VAULT_STATUS)[number]

export const PRIMARY_DEX = ["LFJ", "BLACKHOLE"] as const
type PrimaryDex = (typeof PRIMARY_DEX)[number]
export const primaryDexToString = (value: number): PrimaryDex => PRIMARY_DEX[value] ?? "LFJ"

export type Vault = z.infer<typeof VaultSchema>
export type VaultBlockchain = z.infer<typeof VaultBlockchainSchema>
export type VaultsResponse = z.infer<typeof VaultsResponseSchema>
export type TokenDetails = z.infer<typeof TokenSchema>

export type UniswapPoolConfig = z.infer<typeof UniswapPoolConfigSchema>
export type BlackholePoolConfig = z.infer<typeof BlackholePoolConfigSchema>
export type LFJPoolConfig = z.infer<typeof LFJPoolConfigSchema>

export type OrderSide = z.infer<typeof OrderSideSchema>
export type TradeRequestStatus = z.infer<typeof TradeRequestStatusSchema>
export type ListOrdersQuery = z.infer<typeof ListOrdersQuerySchema>
export type OrderStatusResponse = z.infer<typeof OrderStatusResponseSchema>
export type OrderListResponse = z.infer<typeof OrderListResponseSchema>

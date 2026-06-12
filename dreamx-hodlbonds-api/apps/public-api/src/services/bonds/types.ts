import type { z } from "@hono/zod-openapi"
import type { Address } from "viem"

import type {
  BondDetailResponseSchema,
  BondsByOwnerResponseSchema,
  BondSchema,
  BondTokenSchema,
  DexDetailsSchema,
  OwnerBondSchema,
  ReceiptTokenBalanceSchema,
  ReceiptTokenTransferSchema,
  TokenMetadataSchema,
  TokensMapSchema,
  TradeSchema,
  VaultStateSchema,
} from "@/schemas/bonds"

// Inferred types from schemas
export type Bond = z.infer<typeof BondSchema>
export type BondToken = z.infer<typeof BondTokenSchema>
export type DexDetails = z.infer<typeof DexDetailsSchema>
export type TokenMetadata = z.infer<typeof TokenMetadataSchema>
export type TokensMap = z.infer<typeof TokensMapSchema>
export type Trade = z.infer<typeof TradeSchema>
export type ReceiptTokenBalance = z.infer<typeof ReceiptTokenBalanceSchema>
export type ReceiptTokenTransfer = z.infer<typeof ReceiptTokenTransferSchema>
export type BondDetailResponse = z.infer<typeof BondDetailResponseSchema>
export type BondsByOwnerResponse = z.infer<typeof BondsByOwnerResponseSchema>
export type OwnerBond = z.infer<typeof OwnerBondSchema>
export type VaultState = z.infer<typeof VaultStateSchema>

// Service input types
export interface GetBondParams {
  chainId: number
  vaultAddress: Address
}

export interface GetBondsByOwnerParams {
  ownerAddress: Address
}

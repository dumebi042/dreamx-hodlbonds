import { z } from "@hono/zod-openapi"

import {
  BigIntStringSchema,
  ChainIdParamSchema,
  ChainIdSchema,
  EthereumAddressOutputSchema,
  EthereumAddressSchema,
  UnixTimestampSchema,
} from "./common"

// ============================================================================
// Request Schemas
// ============================================================================

export const BondByIdRequestSchema = z
  .object({
    chainId: ChainIdParamSchema,
    vaultAddress: EthereumAddressSchema.openapi({
      description: "Vault contract address",
    }),
  })
  .openapi("BondByIdRequest")

export const BondsByOwnerRequestSchema = z
  .object({
    ownerAddress: EthereumAddressSchema.openapi({
      description: "Owner wallet address",
    }),
  })
  .openapi("BondsByOwnerRequest")

// ============================================================================
// Nested Response Schemas
// ============================================================================

export const TokenMetadataSchema = z
  .object({
    address: EthereumAddressOutputSchema,
    symbol: z.string(),
    name: z.string(),
    decimals: z.number().int().nonnegative(),
  })
  .openapi("TokenMetadata")

// Extended token schema with balance details for bond vault/stable tokens
export const BondTokenSchema = z
  .object({
    address: EthereumAddressOutputSchema,
    symbol: z.string(),
    name: z.string(),
    decimals: z.number().int().nonnegative(),
    // Balance fields (raw BigInt strings)
    balance: BigIntStringSchema,
    startingBalance: BigIntStringSchema,
    frozenBalance: BigIntStringSchema,
    availableBalance: BigIntStringSchema,
    finalBalance: BigIntStringSchema.nullable(),
  })
  .openapi("BondToken")

export const DexNameSchema = z.enum(["LFJ", "Blackhole"]).openapi("DexName")

export const DexDetailsSchema = z
  .object({
    name: DexNameSchema,
    url: z.url(),
    pairAddress: EthereumAddressOutputSchema.nullable(),
  })
  .openapi("DexDetails")

export const VaultStateSchema = z
  .enum(["BOND_ISSUANCE", "TRADING", "HARVESTING", "CLAIM", "SETTLED"])
  .openapi("VaultState")

// Note: This schema is for complete bonds only (isComplete = true)
// Fields marked as non-nullable are guaranteed to exist for complete bonds
export const BondSchema = z
  .object({
    chainId: ChainIdSchema,
    createdAt: UnixTimestampSchema,

    issuer: EthereumAddressOutputSchema,
    vaultAddress: EthereumAddressOutputSchema,

    // Token details with balance information
    vaultToken: BondTokenSchema,
    stableToken: BondTokenSchema,

    // Factory event data (guaranteed for complete bonds)
    factoryAddress: EthereumAddressOutputSchema,
    receiptTokenAddress: EthereumAddressOutputSchema,
    managementFee: z.number().int(),
    managementFeePaid: BigIntStringSchema.nullable(),
    performanceFee: z.number().int(),
    performanceFeePaid: BigIntStringSchema.nullable(),

    vaultId: z.number().int(),
    bondPrice: BigIntStringSchema,
    reserveRatio: z.number().int(),
    tradingPeriodDuration: z.number().int(),
    tradingEndsAt: UnixTimestampSchema,

    // DEX configuration
    primaryDex: DexDetailsSchema,
    secondaryDex: DexDetailsSchema,

    // Vault state (guaranteed for complete bonds)
    vaultState: VaultStateSchema,
    balanceUpdatedAt: UnixTimestampSchema.nullable(),
    lastSwapAt: UnixTimestampSchema.nullable(),
    settledAt: UnixTimestampSchema.nullable(),
    settledBy: EthereumAddressOutputSchema.nullable(),
  })
  .openapi("Bond")

export const TradeSchema = z
  .object({
    timestamp: UnixTimestampSchema,
    dex: z.enum(["LFJ", "Blackhole", "Unknown"]),
    tokenIn: EthereumAddressOutputSchema,
    tokenOut: EthereumAddressOutputSchema,
    amountIn: BigIntStringSchema,
    amountOut: BigIntStringSchema,
    tokenInBalance: BigIntStringSchema,
    tokenOutBalance: BigIntStringSchema,
  })
  .openapi("Trade")

export const TransferTypeSchema = z
  .enum(["transfer", "mint", "burn", "marketplace", "loan"])
  .openapi("TransferType")

export const ReceiptTokenBalanceSchema = z
  .object({
    lastUpdatedAt: UnixTimestampSchema,
    ownerAddress: EthereumAddressOutputSchema,
    balance: BigIntStringSchema,
  })
  .openapi("ReceiptTokenBalance")

export const ReceiptTokenTransferSchema = z
  .object({
    timestamp: UnixTimestampSchema,
    type: TransferTypeSchema,
    from: EthereumAddressOutputSchema,
    to: EthereumAddressOutputSchema,
    amount: BigIntStringSchema,
  })
  .openapi("ReceiptTokenTransfer")

// ============================================================================
// Response Schemas
// ============================================================================

// Token lookup map keyed by checksummed address
export const TokensMapSchema = z
  .record(EthereumAddressOutputSchema, TokenMetadataSchema)
  .openapi("TokensMap")

export const BondDetailResponseSchema = z
  .object({
    bond: BondSchema,
    tokens: TokensMapSchema,
    trades: z.array(TradeSchema),
    balances: z.array(ReceiptTokenBalanceSchema),
    transfers: z.array(ReceiptTokenTransferSchema),
  })
  .openapi("BondDetailResponse")

export const OwnerBondSchema = z
  .object({
    bond: BondSchema,
    ownerBalance: BigIntStringSchema,
    trades: z.array(TradeSchema),
    transfers: z.array(ReceiptTokenTransferSchema),
  })
  .openapi("OwnerBond")

export const BondsByOwnerResponseSchema = z
  .object({
    owner: EthereumAddressOutputSchema,
    bonds: z.array(OwnerBondSchema),
    tokens: TokensMapSchema,
  })
  .openapi("BondsByOwnerResponse")

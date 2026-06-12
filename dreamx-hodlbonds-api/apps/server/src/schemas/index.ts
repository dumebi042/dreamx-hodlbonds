import { chainIds } from "@hodlbonds-api/blockchain"
import { z } from "@hono/zod-openapi"
import { getAddress } from "viem"

import { VAULT_STATUS } from "@/types"

const chainIdStringValues = chainIds.map((item) => item.toString()) as [string, ...string[]]

const EthereumAddressSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^0x[a-fA-F0-9]{40}$/, "Must be a valid Ethereum address")
  .transform((val) => getAddress(val))
  .openapi("EthereumAddress", {
    description: "A valid EVM address",
    example: "0x1234567890123456789012345678901234567890",
  })

const ChainIdSchema = z.enum(chainIdStringValues).openapi("ChainId", {
  example: chainIdStringValues[0],
  description: "EVM ChainId",
})

export const TokenRequestSchema = z.object({
  chainId: ChainIdSchema,
  factoryAddress: EthereumAddressSchema.openapi({
    example: "0x1234567890123456789012345678901234567890",
    description: "Factory contract address",
  }),
  id: z.string(),
})

export const DexSchema = z.object({
  name: z.string(),
  url: z.url(),
  pairAddress: EthereumAddressSchema,
})

const DecimalTokenQuantitySchema = z
  .string()
  // .regex(/^\d+(\.\d+)?$/, 'Must be a string representing a non-negative decimal number')
  .openapi({
    description: "Token quantity represented as a decimal string",
    example: "1234.5678",
  })

const RawTokenQuantitySchema = z
  .string()
  .regex(/^[0-9]+$/, "Must be a string representing a non-negative integer")
  .openapi({
    description:
      "Token quantity represented as a raw integer string (in smallest unit, e.g., wei for ETH)",
    example: "1000000000000000000", // 1 ETH in wei
  })

export const PoolTokenSchema = z
  .object({
    address: EthereumAddressSchema,
    name: z.string(),
    symbol: z.string(),
    decimals: z.number().int().nonnegative(),
    balance: DecimalTokenQuantitySchema,
    startingBalance: DecimalTokenQuantitySchema,
    frozenBalance: DecimalTokenQuantitySchema,
    availableBalance: DecimalTokenQuantitySchema,
  })
  .openapi("Pool Token", {
    description: "Vault/Stable Token details and balances",
  })

export const ReceiptTokenSchema = z.object({
  id: z.number().nonnegative().int(),
  name: z.string(),
  description: z.string(),
  image: z.string(),
  contractAddress: EthereumAddressSchema,
  vaultAddress: EthereumAddressSchema,
  createdBy: EthereumAddressSchema,
  createdAt: z.number().int().positive(),
  bondState: z.enum(VAULT_STATUS),
  bondPrice: RawTokenQuantitySchema,
  tradingPeriodDuration: z.number().int().nonnegative(),
  reserveRatio: z.number().nonnegative(),
  managementFee: z.number().int().nonnegative(),
  performanceFee: z.number().int().nonnegative(),
  primaryDex: DexSchema,
  secondaryDex: DexSchema,
  vaultToken: PoolTokenSchema,
  stableToken: PoolTokenSchema,
})

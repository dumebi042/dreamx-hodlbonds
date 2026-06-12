import { chainIds } from "@hodlbonds-api/blockchain"
import { z } from "@hono/zod-openapi"
import { getAddress } from "viem"

import { PRIMARY_DEX, VAULT_STATUS } from "@/types"

const Base64SignatureSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9+/]+={0,2}$/, "Must be a valid base64-encoded string")
  .openapi({
    description: "Base64-encoded HMAC signature",
    example: "l6gZk0U3H0xX9dQX3wQmVgqE7QsfT+FJ4JcY7H8f9lM=",
  })

export const OrderAuthHeadersSchema = z
  .object({
    "x-api-key": z.uuid().openapi({
      description: "API key identifier",
      example: "123e4567-e89b-12d3-a456-426614174000",
      param: { name: "x-api-key", in: "header", required: true },
    }),
    "x-timestamp": z
      .string()
      .regex(/^\d+$/, "Timestamp must be a millisecond unix epoch as a string")
      .openapi({
        description: "Request timestamp in milliseconds (unix epoch)",
        example: `${Date.now()}`,
        param: { name: "x-timestamp", in: "header", required: true },
      }),
    "x-signature": Base64SignatureSchema.openapi({
      param: { name: "x-signature", in: "header", required: true },
    }),
  })
  .openapi("OrderAuthHeaders", {
    description: "HMAC authentication headers required for order requests.",
  })

export const ServerTimeSchema = z.object({
  serverTime: z.number().openapi({
    example: Date.now(),
  }),
})

const chainIdStringValues = chainIds.map((item) => item.toString()) as [string, ...string[]]

export const EthereumAddressSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^0x[a-fA-F0-9]{40}$/, "Must be a valid Ethereum address")
  .transform((val) => getAddress(val))
  .openapi("EthereumAddress", {
    description: "A valid EVM address",
    example: "0x1234567890123456789012345678901234567890",
  })

export const ChainIdSchema = z.enum(chainIdStringValues).openapi("ChainId", {
  example: chainIdStringValues[0],
  description: "EVM ChainId",
})

export const ChainIdParamsSchema = z.object({
  chainId: ChainIdSchema,
})

export const DecimalTokenQuantitySchema = z
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

export const TokenSchema = z
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
  .openapi("Token", {
    description: "Vault/Stable Token details and balances",
  })

export const VaultRequestSchema = z.object({
  chainId: ChainIdSchema,
  address: EthereumAddressSchema.openapi({
    example: "0x1234567890123456789012345678901234567890",
    description: "Vault contract address",
  }),
})

export const UniswapPoolConfigSchema = z.object({
  poolId: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^0x[a-fA-F0-9]{64}$/, "Must be a valid 64-digit hex string"),
  poolKey: z.object({
    currency0: EthereumAddressSchema,
    currency1: EthereumAddressSchema,
    fee: z.number().nonnegative().int(),
    tickSpacing: z.number().int(),
    hooks: EthereumAddressSchema,
  }),
  permit2Address: EthereumAddressSchema,
  positionManagerAddress: EthereumAddressSchema,
  routerAddress: EthereumAddressSchema,
})

export const BlackholePoolConfigSchema = z.object({
  routerV2Address: EthereumAddressSchema,
  pairAddress: EthereumAddressSchema,
  concentrated: z.boolean(),
})

export const LFJPoolConfigSchema = z.object({
  routerAddress: EthereumAddressSchema,
  tokenPairAddress: EthereumAddressSchema,
  version: z.number().nonnegative().int(),
})

const VaultCoreSchema = z.object({
  vaultId: z.number().nonnegative().int(),
  vaultAddress: EthereumAddressSchema,
  vaultState: z.enum(VAULT_STATUS),
  createdBy: EthereumAddressSchema,
  createdAt: z.number().int().positive(),
  tradingPeriodDuration: z.number().int().positive(),
  tradingEndsAt: z.number().int().positive(),
  bondPrice: RawTokenQuantitySchema,
  reserveRatio: z.number().nonnegative(),
  primaryDex: z.enum(PRIMARY_DEX),
  vaultToken: TokenSchema,
  stableToken: TokenSchema,
})

export const VaultBlockchainSchema = VaultCoreSchema.extend({
  chainlinkPriceOracleAddress: EthereumAddressSchema,
  wrappedNativeTokenAddress: EthereumAddressSchema,
  pool: z
    .object({
      uniswap: UniswapPoolConfigSchema.optional(),
      lfj: LFJPoolConfigSchema.optional(),
      blackhole: BlackholePoolConfigSchema.optional(),
    })
    .openapi("PoolConfig", {
      description: "DEX pool configuration",
    }),
})

export const OrderSideSchema = z.enum(["buy", "sell"]).openapi("Side", {
  description:
    'Order side. "Buy" means purchasing the base currency (vault token) using the quote currency (stable token); "Sell" means selling the base currency (vault token) for the quote currency (stable token).',
  example: "buy",
})

// Trade request schemas
export const ClientOrderIdSchema = z
  .string()
  .length(32)
  .regex(/^[a-f0-9]+$/i, "Must be a valid UUID4 without hyphens (32 hex characters)")
  .openapi("ClientOrderId", {
    description: "Unique order identifier provided by the trading manager (UUID4 without hyphens)",
    example: "550e8400e29b41d4a716446655440000",
  })

export const TxHashSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, "Must be a valid transaction hash")
  .openapi("TransactionHash", {
    description: "EVM transaction hash",
    example: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
  })

export const TradeRequestStatusSchema = z
  .enum(["created", "submitted", "pending", "retry", "executed", "failed", "rejected"])
  .openapi("TradeRequestStatus", {
    description:
      'Current status of the trade request. "Created" means the order is reserved but pre-flight validation is still in progress. "Submitted" means validated and published to the executor. "Pending" means the executor has picked up the request and is attempting to execute it. "Retry" means the executor encountered a transient error and will retry execution. "Executed" means the trade was successfully executed on-chain. "Failed" means the executor has exhausted all retries and the trade did not execute successfully. "Rejected" means the API refused the order before publishing (e.g. insufficient balance, DEX quote failure).',
    example: "submitted",
  })

export const ISOTimestampSchema = z.iso.datetime().openapi({
  description: "ISO 8601 timestamp",
  example: "2026-02-09T12:00:00.000Z",
})

const DecimalStringSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/, "Must be a positive decimal number as a string")
  .refine((val) => parseFloat(val) > 0, "Must be greater than zero")

export const CreateOrderBodySchema = z.object({
  clientOrderId: ClientOrderIdSchema,
  vaultAddress: EthereumAddressSchema,
  side: OrderSideSchema,
  size: DecimalStringSchema.openapi({
    description:
      "Amount to buy/sell. For buy orders: quote coins (e.g. USDC). For sell orders: base coins (e.g. BTC).",
    example: "2.768",
  }),
})

export const CreateOrderResponseSchema = z
  .object({
    clientOrderId: ClientOrderIdSchema,
  })
  .openapi("CreateOrderResponse", {
    description: "Order accepted and submitted to executor",
  })

export type CreateOrderBody = z.infer<typeof CreateOrderBodySchema>
export type CreateOrderResponse = z.infer<typeof CreateOrderResponseSchema>

// --- Order Query Schemas ---

export const GetOrderParamsSchema = z.object({
  clientOrderId: ClientOrderIdSchema,
})

export const ListOrdersQuerySchema = z.object({
  chainId: ChainIdSchema.optional().openapi({
    description: "Filter by chain ID",
    example: "43114",
  }),
  vaultAddress: EthereumAddressSchema.optional().openapi({
    description: "Filter by vault address",
  }),
  status: TradeRequestStatusSchema.optional().openapi({
    description: "Filter by order status",
  }),
  createdAfter: ISOTimestampSchema.optional().openapi({
    description: "Filter orders created on or after this ISO 8601 timestamp",
    example: "2026-02-01T00:00:00Z",
  }),
  createdBefore: ISOTimestampSchema.optional().openapi({
    description: "Filter orders created on or before this ISO 8601 timestamp",
    example: "2026-02-28T23:59:59Z",
  }),
  limit: z.coerce.number().int().min(1).max(1000).default(100).openapi({
    description: "Maximum number of results to return (1-1000)",
    example: "100",
  }),
  offset: z.coerce.number().int().min(0).default(0).openapi({
    description: "Number of results to skip",
    example: "0",
  }),
})

// --- Order Query Response Schemas ---

export const OrderStatusResponseSchema = z
  .object({
    clientOrderId: ClientOrderIdSchema,
    chainId: z.number().int().positive(),
    vaultAddress: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/)
      .openapi({ description: "Vault contract address" }),
    side: OrderSideSchema,
    size: DecimalTokenQuantitySchema,
    status: TradeRequestStatusSchema,
    txHash: TxHashSchema.nullable(),
    createdAt: ISOTimestampSchema,
    lastStatusAt: ISOTimestampSchema.nullable(),
    expiresAt: ISOTimestampSchema.nullable(),
    executedAt: ISOTimestampSchema.nullable(),
  })
  .openapi("OrderStatus", {
    description: "Trade request status and details",
  })

export const OrderListResponseSchema = z
  .object({
    orders: z.array(OrderStatusResponseSchema),
    pagination: z.object({
      limit: z.number().int().positive(),
      offset: z.number().int().nonnegative(),
      count: z.number().int().nonnegative(),
      total: z.number().int().nonnegative(),
    }),
  })
  .openapi("OrderList", {
    description: "Paginated list of trade requests",
  })

export const VaultSchema = VaultCoreSchema.extend({
  lastTradedAt: z.number().int().positive().nullable(),
  lastTradeRequest: OrderStatusResponseSchema.nullable().optional().openapi({
    description: "Most recent trade request for this vault, if any",
  }),
})

export const VaultsResponseSchema = z.array(VaultSchema)

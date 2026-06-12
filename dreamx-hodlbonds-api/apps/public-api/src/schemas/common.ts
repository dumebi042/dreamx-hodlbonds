import { chainIds } from "@hodlbonds-api/blockchain"
import { z } from "@hono/zod-openapi"
import { getAddress } from "viem"

// Chain IDs as string enum for URL params
const chainIdStringValues = chainIds.map((item) => item.toString()) as [string, ...string[]]

export const ChainIdParamSchema = z.enum(chainIdStringValues).openapi("ChainIdParam", {
  example: chainIdStringValues[0],
  description: "EVM Chain ID (as URL parameter)",
})

export const ChainIdSchema = z.number().int().positive().openapi("ChainId", {
  example: 43114,
  description: "EVM Chain ID",
})

export const EthereumAddressSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^0x[a-fA-F0-9]{40}$/, "Must be a valid Ethereum address")
  .transform((val) => getAddress(val))
  .openapi("EthereumAddress", {
    description: "A valid EVM address (checksummed)",
    example: "0x1234567890123456789012345678901234567890",
  })

export const EthereumAddressOutputSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/)
  .openapi("EthereumAddressOutput", {
    description: "A checksummed EVM address",
    example: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
  })

export const TxHashSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/)
  .openapi("TxHash", {
    description: "Transaction hash",
    example: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
  })

// BigInt as string for JSON serialization
export const BigIntStringSchema = z
  .string()
  .regex(/^-?\d+$/)
  .openapi("BigIntString", {
    description: "BigInt value as string",
    example: "1000000000000000000",
  })

// Unix timestamp in seconds (not milliseconds)
export const UnixTimestampSchema = z.number().int().nonnegative().openapi("UnixTimestamp", {
  description: "Unix timestamp in seconds",
  example: 1706054400,
})

// Alchemy webhook payload types
// Based on: https://www.alchemy.com/docs/reference/custom-webhook

import { getAddress, type Address, type Hex } from "viem"
import * as z from "zod"

// Custom schemas for blockchain data types
const hexStringSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]*$/, "Must be a valid hex string")
  .transform((val) => val as Hex)

const ethereumAddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "Must be a valid Ethereum address")
  .transform((val) => getAddress(val) as Address)

// 32 bytes (64 hex chars) - used for tx hashes, block hashes, and topics
const bytes32Schema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, "Must be a valid 32-byte hex string")
  .transform((val) => val as Hex)

// Zod schemas for Alchemy webhook payloads
export const alchemyLogSchema = z.object({
  account: z.object({
    address: ethereumAddressSchema,
  }),
  topics: z.array(bytes32Schema),
  data: hexStringSchema,
  index: z.number(),
  transaction: z.object({
    hash: bytes32Schema,
    nonce: z.number(),
    index: z.number(),
    from: z.object({
      address: ethereumAddressSchema,
    }),
    to: z
      .object({
        address: ethereumAddressSchema,
      })
      .nullable(),
    value: z.string(),
    // gasPrice: z.string(),
    // maxFeePerGas: z.string().optional(),
    // maxPriorityFeePerGas: z.string().optional(),
    // gas: z.number(),
    // status: z.number(),
    // gasUsed: z.number(),
    // cumulativeGasUsed: z.number(),
    // effectiveGasPrice: z.string(),
    // type: z.number(),
  }),
})

export const alchemyWebhookPayloadSchema = z.object({
  webhookId: z.string(),
  id: z.string(),
  createdAt: z.string(),
  type: z.literal("GRAPHQL"),
  event: z.object({
    data: z.object({
      block: z.object({
        hash: bytes32Schema,
        number: z.number(),
        timestamp: z.number(),
        logs: z.array(alchemyLogSchema),
      }),
    }),
  }),
  sequenceNumber: z.string().nullable().optional(),
  network: z.string().nullable().optional(),
})

// Infer types from schemas
export type AlchemyLog = z.infer<typeof alchemyLogSchema>
export type AlchemyWebhookPayload = z.infer<typeof alchemyWebhookPayloadSchema>

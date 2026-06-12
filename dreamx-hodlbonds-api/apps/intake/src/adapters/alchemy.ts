import type { Hex } from "viem"

import type { AlchemyWebhookPayload } from "../types/alchemy"
import type { Log } from "../types/events"

import { alchemyWebhookPayloadSchema } from "../types/alchemy"

/**
 * Error thrown when Alchemy payload cannot be transformed
 * Should result in 500 response so Alchemy retries
 */
export class AlchemyTransformError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AlchemyTransformError"
  }
}

/**
 * Transforms Alchemy webhook payload into standardized viem Log objects
 * This adapter only normalizes the format - decoding happens in the decoder layer
 * @param payload - Raw Alchemy webhook payload
 * @param chainId - Chain ID for this webhook (configured per webhook in Alchemy)
 * @returns Array of standardized Log objects
 * @throws AlchemyTransformError if payload is malformed
 */
export function transformAlchemyPayload(payload: AlchemyWebhookPayload, chainId: number): Log[] {
  const result = alchemyWebhookPayloadSchema.safeParse(payload)
  if (!result.success) {
    throw new AlchemyTransformError(`Invalid payload: ${result.error.message}`)
  }

  const { block } = result.data.event.data

  return block.logs.map((log) => ({
    chainId,
    address: log.account.address,
    topics: log.topics as [Hex, ...Hex[]],
    data: log.data,
    blockNumber: BigInt(block.number),
    blockHash: block.hash,
    blockTimestamp: BigInt(block.timestamp),
    transactionHash: log.transaction.hash,
    transactionIndex: log.transaction.index,
    logIndex: log.index,
  }))
}

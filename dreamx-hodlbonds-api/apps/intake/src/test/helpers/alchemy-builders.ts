/**
 * Test utilities for building Alchemy webhook payloads
 *
 * Provides builders for creating realistic Alchemy webhook payloads with:
 * - Random data via faker for simple tests
 * - ABI-encoded event data for accurate event testing
 * - Full override support for all fields
 */

import type { Abi } from "viem"

import { faker } from "@faker-js/faker"

import type { AlchemyLog, AlchemyWebhookPayload } from "@/types/alchemy"

import { encodeEvent } from "./event-encoding"

// ============================================================================
// Basic Builders (random data)
// ============================================================================

/**
 * Build a realistic AlchemyLog with random data
 *
 * @param overrides - Partial AlchemyLog to override defaults
 * @returns Complete AlchemyLog with faker-generated data
 *
 * @example
 * const log = buildAlchemyLog()
 * const log = buildAlchemyLog({ index: 5 })
 */
export function buildAlchemyLog(overrides?: Partial<AlchemyLog>): AlchemyLog {
  return {
    account: {
      address: faker.finance.ethereumAddress() as `0x${string}`,
    },
    topics: [
      faker.string.hexadecimal({ length: 64, prefix: "0x" }) as `0x${string}`,
      faker.string.hexadecimal({ length: 64, prefix: "0x" }) as `0x${string}`,
    ],
    data: faker.string.hexadecimal({ length: 128, prefix: "0x" }) as `0x${string}`,
    index: faker.number.int({ min: 0, max: 100 }),
    transaction: {
      hash: faker.string.hexadecimal({ length: 64, prefix: "0x" }) as `0x${string}`,
      nonce: faker.number.int({ min: 0, max: 1000 }),
      index: faker.number.int({ min: 0, max: 10 }),
      from: {
        address: faker.finance.ethereumAddress() as `0x${string}`,
      },
      to: {
        address: faker.finance.ethereumAddress() as `0x${string}`,
      },
      value: faker.string.numeric(18),
      // gasPrice: faker.string.numeric(10),
      // gas: faker.number.int({ min: 21000, max: 500000 }),
      // status: 1,
      // gasUsed: faker.number.int({ min: 21000, max: 200000 }),
      // cumulativeGasUsed: faker.number.int({ min: 21000, max: 1000000 }),
      // effectiveGasPrice: faker.string.numeric(10),
      // type: 2,
    },
    ...overrides,
  }
}

/**
 * Build a realistic AlchemyWebhookPayload with random data
 *
 * @param params - Optional configuration
 * @param params.logs - Array of logs to include (defaults to one random log)
 * @param params.overrides - Partial payload to override defaults
 * @returns Complete AlchemyWebhookPayload
 *
 * @example
 * const payload = buildAlchemyPayload()
 * const payload = buildAlchemyPayload({
 *   logs: [buildAlchemyLog(), buildAlchemyLog({ index: 1 })],
 *   overrides: { webhookId: 'wh_test' }
 * })
 */
export function buildAlchemyPayload(params?: {
  logs?: AlchemyLog[]
  overrides?: Partial<AlchemyWebhookPayload>
}): AlchemyWebhookPayload {
  const blockNumber = faker.number.int({ min: 1000000, max: 20000000 })
  const timestamp = faker.date.recent({ days: 7 }).getTime() / 1000

  return {
    webhookId: `wh_${faker.string.alphanumeric(16)}`,
    id: faker.string.uuid(),
    createdAt: new Date().toISOString(),
    type: "GRAPHQL",
    event: {
      data: {
        block: {
          hash: faker.string.hexadecimal({ length: 64, prefix: "0x" }) as `0x${string}`,
          number: blockNumber,
          timestamp: Math.floor(timestamp),
          logs: params?.logs || [buildAlchemyLog()],
        },
      },
    },
    sequenceNumber: faker.string.numeric({ length: 16, allowLeadingZeros: true }),
    network: "AVALANCHE_FUJI",
    ...params?.overrides,
  }
}

// ============================================================================
// Convenience Builders (event-based)
// ============================================================================

/**
 * Build an AlchemyLog from an ABI-encoded event
 *
 * Creates a log with properly encoded topics and data based on the event ABI.
 * Useful for testing event processing with realistic encoded data.
 *
 * @param params - Event-based log parameters
 * @param params.abi - Contract ABI containing the event
 * @param params.eventName - Name of the event
 * @param params.args - Event arguments as object
 * @param params.contractAddress - Contract address (defaults to random)
 * @param params.overrides - Partial log overrides (excluding topics/data)
 * @returns AlchemyLog with encoded event data
 *
 * @example
 * const log = buildAlchemyLogFromEvent({
 *   abi: VAULT_ABI,
 *   eventName: 'VaultCreated',
 *   args: {
 *     vault: '0x123...',
 *     issuer: '0x456...',
 *     vaultId: 1,
 *   },
 *   contractAddress: '0xFactory...',
 *   overrides: { index: 0 }
 * })
 */
export function buildAlchemyLogFromEvent(params: {
  abi: Abi
  eventName: string
  args: Record<string, any>
  contractAddress?: `0x${string}`
  overrides?: Partial<Omit<AlchemyLog, "topics" | "data">>
}): AlchemyLog {
  const { abi, eventName, args, contractAddress, overrides } = params

  // Encode event
  const { topics, data } = encodeEvent({ abi, eventName, args })

  // Build log with encoded data
  return buildAlchemyLog({
    account: {
      address: contractAddress || (faker.finance.ethereumAddress() as `0x${string}`),
    },
    topics,
    data,
    ...overrides,
  })
}

/**
 * Build an AlchemyWebhookPayload from an ABI-encoded event
 *
 * Convenience builder that creates a full webhook payload with a single
 * properly-encoded event log. Useful for testing single-event scenarios.
 *
 * @param params - Event-based payload parameters
 * @param params.abi - Contract ABI containing the event
 * @param params.eventName - Name of the event
 * @param params.args - Event arguments as object
 * @param params.contractAddress - Contract address (defaults to random)
 * @param params.logOverrides - Partial log overrides (excluding topics/data)
 * @param params.payloadOverrides - Partial payload overrides
 * @returns AlchemyWebhookPayload with single encoded event
 *
 * @example
 * const payload = buildAlchemyPayloadFromEvent({
 *   abi: ERC1155_ABI,
 *   eventName: 'TransferSingle',
 *   args: {
 *     operator: '0x...',
 *     from: '0x...',
 *     to: '0x...',
 *     id: 1n,
 *     value: 1n,
 *   },
 *   contractAddress: '0xReceiptToken...',
 *   payloadOverrides: { webhookId: 'wh_test' }
 * })
 */
export function buildAlchemyPayloadFromEvent(params: {
  abi: Abi
  eventName: string
  args: Record<string, any>
  contractAddress?: `0x${string}`
  logOverrides?: Partial<Omit<AlchemyLog, "topics" | "data">>
  payloadOverrides?: Partial<AlchemyWebhookPayload>
}): AlchemyWebhookPayload {
  const { abi, eventName, args, contractAddress, logOverrides, payloadOverrides } = params

  const log = buildAlchemyLogFromEvent({
    abi,
    eventName,
    args,
    contractAddress,
    overrides: logOverrides,
  })

  return buildAlchemyPayload({
    logs: [log],
    overrides: payloadOverrides,
  })
}

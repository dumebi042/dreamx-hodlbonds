/**
 * Test utilities for building standardized Log objects
 *
 * Unlike alchemy-builders which creates Alchemy-specific payloads,
 * these builders create standardized Log objects that have already been
 * transformed by adapters.
 */

import type { Abi } from "viem"

import { faker } from "@faker-js/faker"
import { dualTokenVaultAbi } from "@hodlbonds-api/blockchain/contracts/abis/dualTokenVaultAbi"
import { dualTokenVaultFactoryAbi } from "@hodlbonds-api/blockchain/contracts/abis/dualTokenVaultFactoryAbi"

import type { BondIssuedEvent, Log, TradeCompletedEvent, VaultCreatedEvent } from "@/types/events"

import { encodeEvent } from "./event-encoding"

/**
 * Build a standardized Log with random data
 *
 * @param overrides - Partial Log to override defaults
 * @returns Complete Log with faker-generated data
 *
 * @example
 * const log = buildLog()
 * const log = buildLog({ chainId: 137, logIndex: 5 })
 */
export function buildLog(overrides?: Partial<Log>): Log {
  return {
    address: faker.finance.ethereumAddress() as `0x${string}`,
    topics: [
      faker.string.hexadecimal({ length: 64, prefix: "0x" }) as `0x${string}`,
      faker.string.hexadecimal({ length: 64, prefix: "0x" }) as `0x${string}`,
    ] as [`0x${string}`, ...`0x${string}`[]],
    data: faker.string.hexadecimal({ length: 128, prefix: "0x" }) as `0x${string}`,
    blockNumber: BigInt(faker.number.int({ min: 1000000, max: 20000000 })),
    blockHash: faker.string.hexadecimal({ length: 64, prefix: "0x" }) as `0x${string}`,
    blockTimestamp: BigInt(faker.number.int({ min: 1600000000, max: 1800000000 })),
    transactionHash: faker.string.hexadecimal({ length: 64, prefix: "0x" }) as `0x${string}`,
    transactionIndex: faker.number.int({ min: 0, max: 100 }),
    logIndex: faker.number.int({ min: 0, max: 100 }),
    chainId: 1,
    ...overrides,
  }
}

/**
 * Build a standardized Log with ABI-encoded event data
 *
 * @param params - Event encoding parameters
 * @param params.abi - Contract ABI containing the event
 * @param params.eventName - Name of the event to encode
 * @param params.args - Event arguments as object with parameter names as keys
 * @param params.contractAddress - Address of the contract that emitted the event
 * @param params.overrides - Additional Log fields to override
 * @returns Complete Log with properly encoded event data
 *
 * @example
 * const log = buildLogFromEvent({
 *   abi: ERC20_ABI,
 *   eventName: 'Transfer',
 *   args: { from: '0x...', to: '0x...', value: 1000n },
 *   contractAddress: '0x...'
 * })
 */
export function buildLogFromEvent(params: {
  abi: Abi
  eventName: string
  args: Record<string, any>
  contractAddress?: `0x${string}`
  overrides?: Partial<Log>
}): Log {
  const { abi, eventName, args, contractAddress, overrides } = params

  const { topics, data } = encodeEvent({ abi, eventName, args })

  return buildLog({
    address: contractAddress || (faker.finance.ethereumAddress() as `0x${string}`),
    topics,
    data,
    ...overrides,
  })
}

/**
 * Build a BondIssued Log with ABI-encoded event data
 *
 * @param args - BondIssued event arguments
 * @param overrides - Additional Log fields to override
 * @returns Complete Log that will decode to a BondIssued event
 */
export function buildBondIssuedLog(args: BondIssuedEvent["args"], overrides?: Partial<Log>): Log {
  return buildLogFromEvent({
    abi: dualTokenVaultAbi as Abi,
    eventName: "BondIssued",
    args,
    overrides,
  })
}

/**
 * Build a VaultCreated Log with ABI-encoded event data
 *
 * @param args - VaultCreated event arguments
 * @param overrides - Additional Log fields to override
 * @returns Complete Log that will decode to a VaultCreated event
 */
export function buildVaultCreatedLog(
  args: VaultCreatedEvent["args"],
  overrides?: Partial<Log>,
): Log {
  return buildLogFromEvent({
    abi: dualTokenVaultFactoryAbi as Abi,
    eventName: "VaultCreated",
    args,
    overrides,
  })
}

/**
 * Build a TradeCompleted Log with ABI-encoded event data
 *
 * @param args - TradeCompleted event arguments
 * @param overrides - Additional Log fields to override
 * @returns Complete Log that will decode to a TradeCompleted event
 */
export function buildTradeCompletedLog(
  args: TradeCompletedEvent["args"],
  overrides?: Partial<Log>,
): Log {
  return buildLogFromEvent({
    abi: dualTokenVaultAbi as Abi,
    eventName: "TradeCompleted",
    args,
    overrides,
  })
}

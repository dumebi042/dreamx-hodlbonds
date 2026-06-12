import {
  bondMarketplaceAbi,
  dualTokenVaultAbi,
  dualTokenVaultFactoryAbi,
} from "@hodlbonds-api/blockchain"
import {
  AbiEventSignatureNotFoundError,
  decodeEventLog,
  erc1155Abi,
  parseAbiItem,
  type Hex,
} from "viem"

import type { Event, EventByName, Log } from "../types/events"

const combinedAbi = [
  ...dualTokenVaultFactoryAbi,
  ...dualTokenVaultAbi,
  ...erc1155Abi,
  ...bondMarketplaceAbi,
  parseAbiItem(
    "event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)",
  ),
].filter((f) => f.type === "event")

/**
 * Attempts to decode a log using known ABIs
 * Returns a flat event object (decoded fields + log fields), or null if not recognized
 *
 * @overload When called without eventName, returns union type Event | null
 * @overload When called with eventName, returns specific event type or null
 *
 * @example
 * const event = decodeLog(log) // Event | null (union)
 * const vaultEvent = decodeLog(log, "VaultCreated") // EventByName<"VaultCreated"> | null (specific)
 */
export function decodeLog(log: Log): Event | null
export function decodeLog<TName extends Event["eventName"]>(
  log: Log,
  expectedEventName: TName,
): EventByName<TName> | null
export function decodeLog<TName extends Event["eventName"]>(
  log: Log,
  expectedEventName?: TName,
): Event | null {
  try {
    const decoded = decodeEventLog({
      abi: combinedAbi,
      data: log.data,
      topics: log.topics as [Hex, ...Hex[]],
      // strict: false,
    })

    const event = { ...decoded, ...log } as Event

    // If an expected event name was provided, verify it matches
    if (expectedEventName !== undefined && event.eventName !== expectedEventName) {
      return null
    }

    return event
  } catch (error) {
    // Log doesn't match any known event signature
    if (error instanceof AbiEventSignatureNotFoundError) {
      console.warn("Unrecognized event signature:", error.cause ?? error.shortMessage)
    } else {
      console.warn("Could not decode log:", error)
    }
    return null
  }
}

/**
 * Decodes an array of logs
 * Filters out unrecognized logs
 */
export function decodeLogs(logs: Log[]): Event[] {
  return logs.map((log) => decodeLog(log)).filter((e): e is Event => e !== null)
}

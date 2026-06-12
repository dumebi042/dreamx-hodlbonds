import type {
  bondMarketplaceAbi,
  dualTokenVaultAbi,
  dualTokenVaultFactoryAbi,
} from "@hodlbonds-api/blockchain"
import type { Log as _Log, decodeEventLog, erc1155Abi, Hex } from "viem"

/**
 * Extended Log type that includes chainId metadata
 * This is the standardized format that all provider adapters should produce
 */
export interface Log extends Omit<_Log, "transactionHash" | "removed"> {
  chainId: number
  transactionHash: Hex
}

export type DecodedLog<T> = T & Log

export type VaultCreatedEvent = ReturnType<
  typeof decodeEventLog<typeof dualTokenVaultFactoryAbi, "VaultCreated">
>
export type ApprovedPairSetEvent = ReturnType<
  typeof decodeEventLog<typeof dualTokenVaultFactoryAbi, "ApprovedPairSet">
>
export type BondIssuedEvent = ReturnType<
  typeof decodeEventLog<typeof dualTokenVaultAbi, "BondIssued">
>
export type BondRedeemedEvent = ReturnType<
  typeof decodeEventLog<typeof dualTokenVaultAbi, "BondRedeemed">
>
export type TradeCompletedEvent = ReturnType<
  typeof decodeEventLog<typeof dualTokenVaultAbi, "TradeCompleted">
>
export type FeeCollectedEvent = ReturnType<
  typeof decodeEventLog<typeof dualTokenVaultAbi, "FeeCollected">
>

export type TransferSingleEvent = ReturnType<
  typeof decodeEventLog<typeof erc1155Abi, "TransferSingle">
>

export type TransferBatchEvent = ReturnType<
  typeof decodeEventLog<typeof erc1155Abi, "TransferBatch">
>

export type ListingCreatedEvent = ReturnType<
  typeof decodeEventLog<typeof bondMarketplaceAbi, "ListingCreated">
>

export type ListingCancelledEvent = ReturnType<
  typeof decodeEventLog<typeof bondMarketplaceAbi, "ListingCancelled">
>

export type ListingPurchasedEvent = ReturnType<
  typeof decodeEventLog<typeof bondMarketplaceAbi, "ListingPurchased">
>

export type ApprovedTokenSetSetEvent = ReturnType<
  typeof decodeEventLog<typeof bondMarketplaceAbi, "ApprovedTokenSetSet">
>

export type Event = DecodedLog<
  | VaultCreatedEvent
  | ApprovedPairSetEvent
  | BondIssuedEvent
  | BondRedeemedEvent
  | TradeCompletedEvent
  | FeeCollectedEvent
  | TransferSingleEvent
  | TransferBatchEvent
  | ListingCreatedEvent
  | ListingCancelledEvent
  | ListingPurchasedEvent
  | ApprovedTokenSetSetEvent
>

/**
 * Helper type to extract a specific event type from the Event union based on eventName
 * This enables type-safe event handling when the event name is known at compile time
 *
 * @example
 * type VCEvent = EventByName<"VaultCreated">  // DecodedLog<VaultCreatedEvent>
 */
export type EventByName<TName extends Event["eventName"]> = Extract<Event, { eventName: TName }>

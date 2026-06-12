import type {
  ApprovedPairSetEvent,
  ApprovedTokenSetSetEvent,
  DecodedLog,
  BondIssuedEvent,
  BondRedeemedEvent,
  FeeCollectedEvent,
  ListingCancelledEvent,
  ListingCreatedEvent,
  ListingPurchasedEvent,
  TradeCompletedEvent,
  VaultCreatedEvent,
  TransferSingleEvent,
  TransferBatchEvent,
} from "@/types/events"

import { handleApprovedPairSet } from "@/handlers/approved-pair-set"
import { handleApprovedTokenSetSet } from "@/handlers/approved-token-set-set"
import { handleBondIssued } from "@/handlers/bond-issued"
import { handleBondRedeemed } from "@/handlers/bond-redeemed"
import { handleFeeCollected } from "@/handlers/fee-collected"
import { handleListingCancelled } from "@/handlers/listing-cancelled"
import { handleListingCreated } from "@/handlers/listing-created"
import { handleListingPurchased } from "@/handlers/listing-purchased"
import { handleTradeCompleted } from "@/handlers/trade-completed"
import { handleTransferBatch } from "@/handlers/transfer-batch"
import { handleTransferSingle } from "@/handlers/transfer-single"
import { handleVaultCreated } from "@/handlers/vault-created"

/**
 * Handler function type - takes specific event, returns Promise<void>
 */
export type EventHandler<T> = (event: DecodedLog<T>) => Promise<void>

/**
 * Registry mapping event names to their handlers
 * This is the single source of truth for which events we support
 */
const EVENT_HANDLERS = {
  ApprovedPairSet: handleApprovedPairSet as EventHandler<ApprovedPairSetEvent>,
  ApprovedTokenSetSet: handleApprovedTokenSetSet as EventHandler<ApprovedTokenSetSetEvent>,
  BondIssued: handleBondIssued as EventHandler<BondIssuedEvent>,
  BondRedeemed: handleBondRedeemed as EventHandler<BondRedeemedEvent>,
  FeeCollected: handleFeeCollected as EventHandler<FeeCollectedEvent>,
  ListingCreated: handleListingCreated as EventHandler<ListingCreatedEvent>,
  ListingCancelled: handleListingCancelled as EventHandler<ListingCancelledEvent>,
  ListingPurchased: handleListingPurchased as EventHandler<ListingPurchasedEvent>,
  TradeCompleted: handleTradeCompleted as EventHandler<TradeCompletedEvent>,
  TransferSingle: handleTransferSingle as EventHandler<TransferSingleEvent>,
  TransferBatch: handleTransferBatch as EventHandler<TransferBatchEvent>,
  VaultCreated: handleVaultCreated as EventHandler<VaultCreatedEvent>,
} as const

/**
 * Type-safe event name - automatically derived from handler registry
 */
export type SupportedEventName = keyof typeof EVENT_HANDLERS

/**
 * Type guard to check if an event name is supported
 */
export function isSupportedEvent(eventName: string): eventName is SupportedEventName {
  return eventName in EVENT_HANDLERS
}

/**
 * Get handler for an event (type-safe)
 */
export function getEventHandler(eventName: SupportedEventName): EventHandler<any> {
  return EVENT_HANDLERS[eventName]
}

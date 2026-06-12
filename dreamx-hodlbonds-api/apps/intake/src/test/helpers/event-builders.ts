/**
 * Utilities for building Event objects for testing
 */

import type { Hex } from "viem"

import { faker } from "@faker-js/faker"

import type {
  ApprovedPairSetEvent,
  ApprovedTokenSetSetEvent,
  BondIssuedEvent,
  BondRedeemedEvent,
  DecodedLog,
  FeeCollectedEvent,
  ListingCancelledEvent,
  ListingCreatedEvent,
  ListingPurchasedEvent,
  TradeCompletedEvent,
  TransferBatchEvent,
  TransferSingleEvent,
  VaultCreatedEvent,
} from "@/types/events"

/**
 * Generic factory function for creating event builders
 */
function createEventBuilder<T extends { eventName: string; args: any }>(eventName: T["eventName"]) {
  return (
    args: T["args"],
    overrides?: Partial<Omit<DecodedLog<T>, "eventName" | "args">>,
  ): DecodedLog<T> => {
    return {
      eventName,
      args,
      address: (overrides?.address || faker.finance.ethereumAddress()) as `0x${string}`,
      blockHash: (overrides?.blockHash ||
        faker.string.hexadecimal({ length: 64, prefix: "0x" })) as Hex,
      blockNumber: BigInt(
        overrides?.blockNumber ?? faker.number.int({ min: 1000000, max: 20000000 }),
      ),
      blockTimestamp:
        overrides?.blockTimestamp ?? BigInt(Math.floor(faker.date.past().getTime() / 1000)),
      data: (overrides?.data || "0x") as Hex,
      logIndex: overrides?.logIndex ?? 0,
      topics: (overrides?.topics || []) as any,
      transactionHash: (overrides?.transactionHash ||
        faker.string.hexadecimal({ length: 64, prefix: "0x" })) as Hex,
      transactionIndex: overrides?.transactionIndex ?? faker.number.int({ min: 0, max: 100 }),
      chainId: overrides?.chainId ?? 1,
    } as DecodedLog<T>
  }
}

/**
 * Event builder functions
 */
export const buildVaultCreatedEvent = createEventBuilder<VaultCreatedEvent>("VaultCreated")
export const buildApprovedPairSetEvent = createEventBuilder<ApprovedPairSetEvent>("ApprovedPairSet")
export const buildBondIssuedEvent = createEventBuilder<BondIssuedEvent>("BondIssued")
export const buildBondRedeemedEvent = createEventBuilder<BondRedeemedEvent>("BondRedeemed")
export const buildTradeCompletedEvent = createEventBuilder<TradeCompletedEvent>("TradeCompleted")
export const buildTransferSingleEvent = createEventBuilder<TransferSingleEvent>("TransferSingle")
export const buildTransferBatchEvent = createEventBuilder<TransferBatchEvent>("TransferBatch")
export const buildFeeCollectedEvent = createEventBuilder<FeeCollectedEvent>("FeeCollected")
export const buildListingCreatedEvent = createEventBuilder<ListingCreatedEvent>("ListingCreated")
export const buildListingCancelledEvent =
  createEventBuilder<ListingCancelledEvent>("ListingCancelled")
export const buildListingPurchasedEvent =
  createEventBuilder<ListingPurchasedEvent>("ListingPurchased")
export const buildApprovedTokenSetSetEvent =
  createEventBuilder<ApprovedTokenSetSetEvent>("ApprovedTokenSetSet")

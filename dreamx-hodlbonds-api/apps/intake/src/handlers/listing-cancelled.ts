import { getDb } from "@hodlbonds-api/db"
import { listings } from "@hodlbonds-api/db/schema/index"
import { and, eq } from "drizzle-orm"
import { getAddress } from "viem"

import type { DecodedLog, ListingCancelledEvent } from "../types/events"

/**
 * Handles ListingCancelled events from the BondMarketplace contract.
 *
 * Updates an existing listing to "cancelled" status by:
 * 1. Validating required event metadata (blockNumber, blockTimestamp)
 * 2. Updating the listing status and settlement fields
 *
 * Throws if the listing is not found, indicating a data consistency issue for retry.
 */
export async function handleListingCancelled(
  event: DecodedLog<ListingCancelledEvent>,
): Promise<void> {
  const { args, chainId, address, transactionHash, blockNumber, blockTimestamp: blockTs } = event
  const { listingId } = args

  if (blockNumber === null || blockTs === undefined) {
    throw new Error(
      `Missing required event metadata for ListingCancelled event ${transactionHash}: ` +
        `blockNumber=${blockNumber}, blockTimestamp=${blockTs}`,
    )
  }

  const db = getDb()
  const blockTimestamp = new Date(Number(blockTs) * 1000)
  const marketplaceAddress = getAddress(address)

  const result = await db
    .update(listings)
    .set({
      status: "cancelled",
      settledTxHash: transactionHash,
      settledBlockNumber: Number(blockNumber),
      settledBlockTimestamp: blockTimestamp,
    })
    .where(
      and(
        eq(listings.chainId, chainId),
        eq(listings.marketplaceAddress, marketplaceAddress),
        eq(listings.listingId, Number(listingId)),
      ),
    )
    .returning({ listingId: listings.listingId })

  if (result.length === 0) {
    throw new Error(
      `Listing not found: chainId=${chainId}, marketplace=${marketplaceAddress}, listingId=${listingId}`,
    )
  }
}

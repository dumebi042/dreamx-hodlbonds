import { getDb } from "@hodlbonds-api/db"
import { listings, marketplaceTokenSets } from "@hodlbonds-api/db/schema/index"
import { and, eq } from "drizzle-orm"
import { getAddress, zeroAddress } from "viem"

import type { DecodedLog, ListingCreatedEvent } from "../types/events"

/**
 * Handles ListingCreated events from the BondMarketplace contract.
 *
 * Creates a new listing record by:
 * 1. Looking up the tokenSetId to resolve receiptTokenAddress and priceTokenAddress
 * 2. Inserting the listing with status "active"
 *
 * If the tokenSet lookup fails, throws an error to mark the event as failed for retry.
 * Private sales have a specific buyer address; public sales use null (zeroAddress → null).
 */
export async function handleListingCreated(event: DecodedLog<ListingCreatedEvent>): Promise<void> {
  const { args, chainId, address, transactionHash, blockNumber, blockTimestamp: blockTs } = event
  const { listingId, owner, tokenSetId, collectionId, price, buyer } = args

  if (blockNumber === null || blockTs === undefined) {
    throw new Error(
      `Missing required event metadata for ListingCreated event ${transactionHash}: ` +
        `blockNumber=${blockNumber}, blockTimestamp=${blockTs}`,
    )
  }

  const blockTimestamp = new Date(Number(blockTs) * 1000)
  const db = getDb()
  const marketplaceAddress = getAddress(address)

  // Lookup token set to resolve addresses
  const tokenSet = await db
    .select({
      receiptTokenAddress: marketplaceTokenSets.receiptTokenAddress,
      priceTokenAddress: marketplaceTokenSets.priceTokenAddress,
    })
    .from(marketplaceTokenSets)
    .where(
      and(
        eq(marketplaceTokenSets.chainId, chainId),
        eq(marketplaceTokenSets.marketplaceAddress, marketplaceAddress),
        eq(marketplaceTokenSets.tokenSetId, Number(tokenSetId)),
      ),
    )
    .limit(1)

  if (tokenSet.length === 0) {
    throw new Error(
      `TokenSet not found: chainId=${chainId}, marketplace=${marketplaceAddress}, tokenSetId=${tokenSetId}`,
    )
  }

  const { receiptTokenAddress, priceTokenAddress } = tokenSet[0]!

  // Convert zeroAddress buyer to null (public listing)
  const buyerAddress = buyer === zeroAddress ? null : getAddress(buyer)

  await db
    .insert(listings)
    .values({
      chainId,
      marketplaceAddress,
      listingId: Number(listingId),
      txHash: transactionHash,
      blockNumber: Number(blockNumber),
      blockTimestamp,
      receiptTokenAddress: getAddress(receiptTokenAddress),
      tokenId: Number(collectionId),
      status: "active",
      seller: getAddress(owner),
      buyer: buyerAddress,
      price,
      priceTokenAddress: getAddress(priceTokenAddress),
      // quantity defaults to 1
    })
    .onConflictDoNothing()
}

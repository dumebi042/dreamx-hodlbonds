import { getDb } from "@hodlbonds-api/db"
import { listings, receiptTokenBalances } from "@hodlbonds-api/db/schema/index"
import { and, eq, sql } from "drizzle-orm"
import { getAddress } from "viem"

import type { DecodedLog, ListingPurchasedEvent } from "../types/events"

/**
 * Handles ListingPurchased events from the BondMarketplace contract.
 *
 * Atomically within a transaction:
 * 1. Validates required event metadata (blockNumber, blockTimestamp)
 * 2. Fetches the existing listing to get seller, receiptTokenAddress, tokenId, quantity
 * 3. Updates the listing status to "completed" with buyer and settlement fields
 * 4. Transfers receipt token balance from seller to buyer
 *
 * Idempotency: If the listing is already "completed", the handler returns early (no-op).
 * Throws if the listing is not found, indicating a data consistency issue for retry.
 * The balance transfer uses the same patterns as processTransfer in transfer-single.ts.
 */
export async function handleListingPurchased(
  event: DecodedLog<ListingPurchasedEvent>,
): Promise<void> {
  const { args, chainId, address, transactionHash, blockNumber, blockTimestamp: blockTs } = event
  const { listingId, buyer: buyerRaw } = args

  if (blockNumber === null || blockTs === undefined) {
    throw new Error(
      `Missing required event metadata for ListingPurchased event ${transactionHash}: ` +
        `blockNumber=${blockNumber}, blockTimestamp=${blockTs}`,
    )
  }

  const db = getDb()
  const blockTimestampDate = new Date(Number(blockTs) * 1000)
  const marketplaceAddress = getAddress(address)
  const buyer = getAddress(buyerRaw)
  const blockNum = Number(blockNumber)

  // Fetch existing listing to get seller, receiptTokenAddress, tokenId, quantity, status
  const [existingListing] = await db
    .select({
      seller: listings.seller,
      receiptTokenAddress: listings.receiptTokenAddress,
      tokenId: listings.tokenId,
      quantity: listings.quantity,
      status: listings.status,
    })
    .from(listings)
    .where(
      and(
        eq(listings.chainId, chainId),
        eq(listings.marketplaceAddress, marketplaceAddress),
        eq(listings.listingId, Number(listingId)),
      ),
    )
    .limit(1)

  if (!existingListing) {
    throw new Error(
      `Listing not found: chainId=${chainId}, marketplace=${marketplaceAddress}, listingId=${listingId}`,
    )
  }

  // Idempotency: if already completed, this is a replay — skip
  if (existingListing.status === "completed") {
    return
  }

  const { seller, receiptTokenAddress, tokenId, quantity } = existingListing
  const transferAmount = BigInt(quantity)

  await db.transaction(async (tx) => {
    // 1. Update listing status to "completed" (only if still "active")
    const updateResult = await tx
      .update(listings)
      .set({
        status: "completed",
        buyer,
        settledTxHash: transactionHash,
        settledBlockNumber: blockNum,
        settledBlockTimestamp: blockTimestampDate,
      })
      .where(
        and(
          eq(listings.chainId, chainId),
          eq(listings.marketplaceAddress, marketplaceAddress),
          eq(listings.listingId, Number(listingId)),
          eq(listings.status, "active"),
        ),
      )
      .returning({ listingId: listings.listingId })

    if (updateResult.length === 0) {
      throw new Error(
        `Failed to update listing: chainId=${chainId}, marketplace=${marketplaceAddress}, listingId=${listingId}. ` +
          `Listing may have been concurrently modified.`,
      )
    }

    // 2. Subtract from seller's balance
    const [existingSellerBalance] = await tx
      .select()
      .from(receiptTokenBalances)
      .where(
        and(
          eq(receiptTokenBalances.chainId, chainId),
          eq(
            receiptTokenBalances.receiptTokenAddress,
            getAddress(receiptTokenAddress) as `0x${string}`,
          ),
          eq(receiptTokenBalances.tokenId, tokenId),
          eq(receiptTokenBalances.ownerAddress, getAddress(seller) as `0x${string}`),
        ),
      )
      .limit(1)

    if (!existingSellerBalance) {
      throw new Error(
        `Missing balance entry for seller ${seller} on token ${receiptTokenAddress}:${tokenId} (chain ${chainId}). ` +
          `Cannot process purchase ${transactionHash}. This may indicate incomplete historical sync.`,
      )
    }

    const newSellerBalance = existingSellerBalance.balance - transferAmount

    if (newSellerBalance <= 0n) {
      // Delete the balance entry
      await tx
        .delete(receiptTokenBalances)
        .where(
          and(
            eq(receiptTokenBalances.chainId, chainId),
            eq(
              receiptTokenBalances.receiptTokenAddress,
              getAddress(receiptTokenAddress) as `0x${string}`,
            ),
            eq(receiptTokenBalances.tokenId, tokenId),
            eq(receiptTokenBalances.ownerAddress, getAddress(seller) as `0x${string}`),
          ),
        )
    } else if (existingSellerBalance.lastUpdateBlockNumber < blockNum) {
      // Update balance and timestamps (newer event)
      await tx
        .update(receiptTokenBalances)
        .set({
          balance: newSellerBalance,
          lastUpdateBlockNumber: blockNum,
          lastUpdateBlockTimestamp: blockTimestampDate,
        })
        .where(
          and(
            eq(receiptTokenBalances.chainId, chainId),
            eq(
              receiptTokenBalances.receiptTokenAddress,
              getAddress(receiptTokenAddress) as `0x${string}`,
            ),
            eq(receiptTokenBalances.tokenId, tokenId),
            eq(receiptTokenBalances.ownerAddress, getAddress(seller) as `0x${string}`),
          ),
        )
    } else {
      // Only update balance, not timestamps (out-of-order event)
      await tx
        .update(receiptTokenBalances)
        .set({ balance: newSellerBalance })
        .where(
          and(
            eq(receiptTokenBalances.chainId, chainId),
            eq(
              receiptTokenBalances.receiptTokenAddress,
              getAddress(receiptTokenAddress) as `0x${string}`,
            ),
            eq(receiptTokenBalances.tokenId, tokenId),
            eq(receiptTokenBalances.ownerAddress, getAddress(seller) as `0x${string}`),
          ),
        )
    }

    // 3. Add to buyer's balance
    await tx
      .insert(receiptTokenBalances)
      .values({
        chainId,
        receiptTokenAddress: getAddress(receiptTokenAddress) as `0x${string}`,
        tokenId,
        ownerAddress: buyer,
        balance: transferAmount,
        lastUpdateBlockNumber: blockNum,
        lastUpdateBlockTimestamp: blockTimestampDate,
      })
      .onConflictDoUpdate({
        target: [
          receiptTokenBalances.chainId,
          receiptTokenBalances.receiptTokenAddress,
          receiptTokenBalances.tokenId,
          receiptTokenBalances.ownerAddress,
        ],
        set: {
          // Always add to balance
          balance: sql`${receiptTokenBalances.balance} + ${transferAmount}`,
          // Only update timestamps if this event is newer
          lastUpdateBlockNumber: sql`
            CASE 
              WHEN ${blockNum} > ${receiptTokenBalances.lastUpdateBlockNumber} 
              THEN ${blockNum} 
              ELSE ${receiptTokenBalances.lastUpdateBlockNumber} 
            END
          `,
          lastUpdateBlockTimestamp: sql`
            CASE 
              WHEN ${blockNum} > ${receiptTokenBalances.lastUpdateBlockNumber} 
              THEN ${blockTimestampDate}::timestamptz 
              ELSE ${receiptTokenBalances.lastUpdateBlockTimestamp} 
            END
          `,
        },
      })
  })
}

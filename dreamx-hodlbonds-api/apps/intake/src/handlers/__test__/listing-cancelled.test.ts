/**
 * Tests for ListingCancelled event handler
 * Verifies correct status update, settlement fields, error handling, and idempotency
 */

import { faker } from "@faker-js/faker"
import { getDb } from "@hodlbonds-api/db"
import { listings, schema } from "@hodlbonds-api/db/schema/index"
import { and, eq } from "drizzle-orm"
import { reset } from "drizzle-seed"
import { getAddress } from "viem"
import { beforeEach, describe, expect, it } from "vitest"

import {
  DEFAULT_TEST_CHAIN_ID,
  DEFAULT_TEST_MARKETPLACE_ADDRESS,
  DEFAULT_TEST_PRICE_TOKEN_ADDRESS,
  DEFAULT_TEST_RECEIPT_TOKEN_ADDRESS,
  insertTestBond,
  insertTestListing,
  insertTestPair,
  insertTestTokenSet,
} from "@/test/helpers/bond-builders"
import { buildListingCancelledEvent } from "@/test/helpers/event-builders"

import { handleListingCancelled } from "../listing-cancelled"

const db = getDb()

describe("handleListingCancelled", () => {
  const SELLER_ADDRESS = getAddress("0xdddddddddddddddddddddddddddddddddddddddd")
  const TOKEN_SET_ID = 1n
  const COLLECTION_ID = 42n
  const LISTING_ID = 100n
  const PRICE = 1000000000000000000n // 1 token

  beforeEach(async () => {
    await reset(db, schema)
  })

  /** Helper to set up standard test data: pair, bond, token set, and an active listing */
  async function setupActiveListing(overrides?: Partial<Parameters<typeof insertTestListing>[0]>) {
    await insertTestPair()
    await insertTestBond({
      vaultId: Number(COLLECTION_ID),
      receiptTokenAddress: DEFAULT_TEST_RECEIPT_TOKEN_ADDRESS,
    })
    await insertTestTokenSet()

    return insertTestListing({
      listingId: Number(LISTING_ID),
      receiptTokenAddress: DEFAULT_TEST_RECEIPT_TOKEN_ADDRESS,
      tokenId: Number(COLLECTION_ID),
      seller: SELLER_ADDRESS,
      price: PRICE,
      priceTokenAddress: DEFAULT_TEST_PRICE_TOKEN_ADDRESS,
      ...overrides,
    })
  }

  describe("update (happy path)", () => {
    it("sets status from active to cancelled", async () => {
      await setupActiveListing()

      const event = buildListingCancelledEvent(
        {
          listingId: LISTING_ID,
          tokenSetId: TOKEN_SET_ID,
          collectionId: COLLECTION_ID,
        },
        {
          address: DEFAULT_TEST_MARKETPLACE_ADDRESS,
          chainId: DEFAULT_TEST_CHAIN_ID,
        },
      )

      await handleListingCancelled(event)

      const stored = await db
        .select()
        .from(listings)
        .where(
          and(
            eq(listings.chainId, DEFAULT_TEST_CHAIN_ID),
            eq(listings.marketplaceAddress, DEFAULT_TEST_MARKETPLACE_ADDRESS),
            eq(listings.listingId, Number(LISTING_ID)),
          ),
        )

      expect(stored).toHaveLength(1)
      expect(stored[0]?.status).toBe("cancelled")
    })

    it("sets settledTxHash, settledBlockNumber, and settledBlockTimestamp from event metadata", async () => {
      await setupActiveListing()

      const txHash = faker.string.hexadecimal({ length: 64, prefix: "0x" }) as `0x${string}`
      const blockNumber = 16000000n
      const blockTimestamp = BigInt(Math.floor(Date.now() / 1000))

      const event = buildListingCancelledEvent(
        {
          listingId: LISTING_ID,
          tokenSetId: TOKEN_SET_ID,
          collectionId: COLLECTION_ID,
        },
        {
          address: DEFAULT_TEST_MARKETPLACE_ADDRESS,
          chainId: DEFAULT_TEST_CHAIN_ID,
          transactionHash: txHash,
          blockNumber,
          blockTimestamp,
        },
      )

      await handleListingCancelled(event)

      const stored = await db
        .select()
        .from(listings)
        .where(
          and(
            eq(listings.chainId, DEFAULT_TEST_CHAIN_ID),
            eq(listings.marketplaceAddress, DEFAULT_TEST_MARKETPLACE_ADDRESS),
            eq(listings.listingId, Number(LISTING_ID)),
          ),
        )

      expect(stored).toHaveLength(1)
      expect(stored[0]?.settledTxHash).toBe(txHash)
      expect(stored[0]?.settledBlockNumber).toBe(Number(blockNumber))
      expect(stored[0]?.settledBlockTimestamp).toEqual(new Date(Number(blockTimestamp) * 1000))
    })

    it("preserves original listing data after cancellation", async () => {
      const originalListing = await setupActiveListing()

      const event = buildListingCancelledEvent(
        {
          listingId: LISTING_ID,
          tokenSetId: TOKEN_SET_ID,
          collectionId: COLLECTION_ID,
        },
        {
          address: DEFAULT_TEST_MARKETPLACE_ADDRESS,
          chainId: DEFAULT_TEST_CHAIN_ID,
        },
      )

      await handleListingCancelled(event)

      const stored = await db
        .select()
        .from(listings)
        .where(
          and(
            eq(listings.chainId, DEFAULT_TEST_CHAIN_ID),
            eq(listings.marketplaceAddress, DEFAULT_TEST_MARKETPLACE_ADDRESS),
            eq(listings.listingId, Number(LISTING_ID)),
          ),
        )

      expect(stored).toHaveLength(1)
      expect(stored[0]?.seller).toBe(originalListing.seller)
      expect(stored[0]?.price).toBe(originalListing.price)
      expect(stored[0]?.receiptTokenAddress).toBe(originalListing.receiptTokenAddress)
      expect(stored[0]?.priceTokenAddress).toBe(originalListing.priceTokenAddress)
      expect(stored[0]?.tokenId).toBe(originalListing.tokenId)
      expect(stored[0]?.quantity).toBe(originalListing.quantity)
      expect(stored[0]?.txHash).toBe(originalListing.txHash)
      expect(stored[0]?.blockNumber).toBe(originalListing.blockNumber)
    })
  })

  describe("error handling", () => {
    it("throws error when blockNumber is null", async () => {
      await setupActiveListing()

      const event = buildListingCancelledEvent(
        {
          listingId: LISTING_ID,
          tokenSetId: TOKEN_SET_ID,
          collectionId: COLLECTION_ID,
        },
        {
          address: DEFAULT_TEST_MARKETPLACE_ADDRESS,
          chainId: DEFAULT_TEST_CHAIN_ID,
          transactionHash: "0xdeadbeef00000000000000000000000000000000000000000000000000000000",
        },
      )

      ;(event as any).blockNumber = null

      await expect(handleListingCancelled(event)).rejects.toThrow(
        "Missing required event metadata for ListingCancelled event",
      )
    })

    it("throws error when blockTimestamp is undefined", async () => {
      await setupActiveListing()

      const event = buildListingCancelledEvent(
        {
          listingId: LISTING_ID,
          tokenSetId: TOKEN_SET_ID,
          collectionId: COLLECTION_ID,
        },
        {
          address: DEFAULT_TEST_MARKETPLACE_ADDRESS,
          chainId: DEFAULT_TEST_CHAIN_ID,
          transactionHash: "0xdeadbeef00000000000000000000000000000000000000000000000000000000",
        },
      )

      event.blockTimestamp = undefined

      await expect(handleListingCancelled(event)).rejects.toThrow(
        "Missing required event metadata for ListingCancelled event",
      )
    })

    it("throws error when listing does not exist", async () => {
      // No listing inserted — only set up pair/bond/tokenSet prerequisites
      await insertTestPair()
      await insertTestBond({
        vaultId: Number(COLLECTION_ID),
        receiptTokenAddress: DEFAULT_TEST_RECEIPT_TOKEN_ADDRESS,
      })
      await insertTestTokenSet()

      const event = buildListingCancelledEvent(
        {
          listingId: LISTING_ID,
          tokenSetId: TOKEN_SET_ID,
          collectionId: COLLECTION_ID,
        },
        {
          address: DEFAULT_TEST_MARKETPLACE_ADDRESS,
          chainId: DEFAULT_TEST_CHAIN_ID,
        },
      )

      await expect(handleListingCancelled(event)).rejects.toThrow(
        `Listing not found: chainId=${DEFAULT_TEST_CHAIN_ID}, marketplace=${DEFAULT_TEST_MARKETPLACE_ADDRESS}, listingId=${LISTING_ID}`,
      )
    })
  })

  describe("idempotency", () => {
    it("is idempotent - processing same cancel event twice produces same result", async () => {
      await setupActiveListing()

      const txHash = faker.string.hexadecimal({ length: 64, prefix: "0x" }) as `0x${string}`
      const blockNumber = 16000000n
      const blockTimestamp = BigInt(Math.floor(Date.now() / 1000))

      const event = buildListingCancelledEvent(
        {
          listingId: LISTING_ID,
          tokenSetId: TOKEN_SET_ID,
          collectionId: COLLECTION_ID,
        },
        {
          address: DEFAULT_TEST_MARKETPLACE_ADDRESS,
          chainId: DEFAULT_TEST_CHAIN_ID,
          transactionHash: txHash,
          blockNumber,
          blockTimestamp,
        },
      )

      await handleListingCancelled(event)
      await handleListingCancelled(event)

      const stored = await db
        .select()
        .from(listings)
        .where(
          and(
            eq(listings.chainId, DEFAULT_TEST_CHAIN_ID),
            eq(listings.marketplaceAddress, DEFAULT_TEST_MARKETPLACE_ADDRESS),
            eq(listings.listingId, Number(LISTING_ID)),
          ),
        )

      expect(stored).toHaveLength(1)
      expect(stored[0]?.status).toBe("cancelled")
      expect(stored[0]?.settledTxHash).toBe(txHash)
      expect(stored[0]?.settledBlockNumber).toBe(Number(blockNumber))
      expect(stored[0]?.settledBlockTimestamp).toEqual(new Date(Number(blockTimestamp) * 1000))
    })
  })

  describe("edge cases", () => {
    it("does not affect other listings in the same marketplace", async () => {
      await setupActiveListing()

      // Insert a second listing with a different ID
      await insertTestListing({
        listingId: Number(LISTING_ID) + 1,
        receiptTokenAddress: DEFAULT_TEST_RECEIPT_TOKEN_ADDRESS,
        tokenId: Number(COLLECTION_ID),
        seller: SELLER_ADDRESS,
        price: PRICE,
        priceTokenAddress: DEFAULT_TEST_PRICE_TOKEN_ADDRESS,
      })

      const event = buildListingCancelledEvent(
        {
          listingId: LISTING_ID,
          tokenSetId: TOKEN_SET_ID,
          collectionId: COLLECTION_ID,
        },
        {
          address: DEFAULT_TEST_MARKETPLACE_ADDRESS,
          chainId: DEFAULT_TEST_CHAIN_ID,
        },
      )

      await handleListingCancelled(event)

      // The cancelled listing
      const cancelled = await db
        .select()
        .from(listings)
        .where(
          and(
            eq(listings.chainId, DEFAULT_TEST_CHAIN_ID),
            eq(listings.marketplaceAddress, DEFAULT_TEST_MARKETPLACE_ADDRESS),
            eq(listings.listingId, Number(LISTING_ID)),
          ),
        )

      expect(cancelled).toHaveLength(1)
      expect(cancelled[0]?.status).toBe("cancelled")

      // The other listing should remain active
      const other = await db
        .select()
        .from(listings)
        .where(
          and(
            eq(listings.chainId, DEFAULT_TEST_CHAIN_ID),
            eq(listings.marketplaceAddress, DEFAULT_TEST_MARKETPLACE_ADDRESS),
            eq(listings.listingId, Number(LISTING_ID) + 1),
          ),
        )

      expect(other).toHaveLength(1)
      expect(other[0]?.status).toBe("active")
    })

    it("does not affect listings in different marketplaces with the same listingId", async () => {
      const otherMarketplace = getAddress("0x7777777777777777777777777777777777777777")

      await setupActiveListing()

      // Insert a listing with the same ID but in a different marketplace
      await insertTestTokenSet({ marketplaceAddress: otherMarketplace })
      await insertTestListing({
        marketplaceAddress: otherMarketplace,
        listingId: Number(LISTING_ID),
        receiptTokenAddress: DEFAULT_TEST_RECEIPT_TOKEN_ADDRESS,
        tokenId: Number(COLLECTION_ID),
        seller: SELLER_ADDRESS,
        price: PRICE,
        priceTokenAddress: DEFAULT_TEST_PRICE_TOKEN_ADDRESS,
      })

      const event = buildListingCancelledEvent(
        {
          listingId: LISTING_ID,
          tokenSetId: TOKEN_SET_ID,
          collectionId: COLLECTION_ID,
        },
        {
          address: DEFAULT_TEST_MARKETPLACE_ADDRESS,
          chainId: DEFAULT_TEST_CHAIN_ID,
        },
      )

      await handleListingCancelled(event)

      // The listing in the target marketplace should be cancelled
      const cancelled = await db
        .select()
        .from(listings)
        .where(
          and(
            eq(listings.chainId, DEFAULT_TEST_CHAIN_ID),
            eq(listings.marketplaceAddress, DEFAULT_TEST_MARKETPLACE_ADDRESS),
            eq(listings.listingId, Number(LISTING_ID)),
          ),
        )

      expect(cancelled).toHaveLength(1)
      expect(cancelled[0]?.status).toBe("cancelled")

      // The listing in the other marketplace should remain active
      const other = await db
        .select()
        .from(listings)
        .where(
          and(
            eq(listings.chainId, DEFAULT_TEST_CHAIN_ID),
            eq(listings.marketplaceAddress, otherMarketplace),
            eq(listings.listingId, Number(LISTING_ID)),
          ),
        )

      expect(other).toHaveLength(1)
      expect(other[0]?.status).toBe("active")
    })
  })
})

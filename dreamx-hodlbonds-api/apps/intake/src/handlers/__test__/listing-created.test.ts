/**
 * Tests for ListingCreated event handler
 * Verifies correct insertion, tokenSet lookup, buyer handling, and idempotency
 */

import { faker } from "@faker-js/faker"
import { getDb } from "@hodlbonds-api/db"
import { listings, schema } from "@hodlbonds-api/db/schema/index"
import { and, eq } from "drizzle-orm"
import { reset } from "drizzle-seed"
import { getAddress, zeroAddress } from "viem"
import { beforeEach, describe, expect, it } from "vitest"

import {
  DEFAULT_TEST_CHAIN_ID,
  DEFAULT_TEST_MARKETPLACE_ADDRESS,
  DEFAULT_TEST_PRICE_TOKEN_ADDRESS,
  DEFAULT_TEST_RECEIPT_TOKEN_ADDRESS,
  insertTestBond,
  insertTestPair,
  insertTestTokenSet,
} from "@/test/helpers/bond-builders"
import { buildListingCreatedEvent } from "@/test/helpers/event-builders"

import { handleListingCreated } from "../listing-created"

const db = getDb()

describe("handleListingCreated", () => {
  const SELLER_ADDRESS = "0xdddddddddddddddddddddddddddddddddddddddd"
  const BUYER_ADDRESS = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
  const TOKEN_SET_ID = 1n
  const COLLECTION_ID = 42n
  const LISTING_ID = 100n
  const PRICE = 1000000000000000000n // 1 token

  beforeEach(async () => {
    await reset(db, schema)
  })

  describe("insert (happy path)", () => {
    it("inserts listing with correct primary key and event data", async () => {
      await insertTestPair()
      await insertTestBond({
        vaultId: Number(COLLECTION_ID),
        receiptTokenAddress: DEFAULT_TEST_RECEIPT_TOKEN_ADDRESS,
      })
      await insertTestTokenSet()

      const txHash = faker.string.hexadecimal({ length: 64, prefix: "0x" }) as `0x${string}`
      const blockNumber = 15000000n
      const blockTimestamp = BigInt(Math.floor(Date.now() / 1000))

      const event = buildListingCreatedEvent(
        {
          listingId: LISTING_ID,
          owner: SELLER_ADDRESS as `0x${string}`,
          tokenSetId: TOKEN_SET_ID,
          collectionId: COLLECTION_ID,
          price: PRICE,
          buyer: zeroAddress,
        },
        {
          address: DEFAULT_TEST_MARKETPLACE_ADDRESS,
          chainId: DEFAULT_TEST_CHAIN_ID,
          transactionHash: txHash,
          blockNumber,
          blockTimestamp,
        },
      )

      await handleListingCreated(event)

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
      expect(stored[0]?.chainId).toBe(DEFAULT_TEST_CHAIN_ID)
      expect(stored[0]?.marketplaceAddress).toBe(DEFAULT_TEST_MARKETPLACE_ADDRESS)
      expect(stored[0]?.listingId).toBe(Number(LISTING_ID))
      expect(stored[0]?.txHash).toBe(txHash)
      expect(stored[0]?.blockNumber).toBe(Number(blockNumber))
      expect(stored[0]?.blockTimestamp).toEqual(new Date(Number(blockTimestamp) * 1000))
    })

    it("inserts listing with checksummed addresses", async () => {
      await insertTestPair()
      await insertTestBond({
        vaultId: Number(COLLECTION_ID),
        receiptTokenAddress: DEFAULT_TEST_RECEIPT_TOKEN_ADDRESS,
      })
      await insertTestTokenSet()

      const event = buildListingCreatedEvent(
        {
          listingId: LISTING_ID,
          owner: SELLER_ADDRESS as `0x${string}`,
          tokenSetId: TOKEN_SET_ID,
          collectionId: COLLECTION_ID,
          price: PRICE,
          buyer: zeroAddress,
        },
        {
          address: DEFAULT_TEST_MARKETPLACE_ADDRESS,
          chainId: DEFAULT_TEST_CHAIN_ID,
        },
      )

      await handleListingCreated(event)

      const stored = await db
        .select()
        .from(listings)
        .where(eq(listings.chainId, DEFAULT_TEST_CHAIN_ID))

      expect(stored).toHaveLength(1)
      expect(stored[0]?.marketplaceAddress).toBe(DEFAULT_TEST_MARKETPLACE_ADDRESS)
      expect(stored[0]?.receiptTokenAddress).toBe(DEFAULT_TEST_RECEIPT_TOKEN_ADDRESS)
      expect(stored[0]?.priceTokenAddress).toBe(DEFAULT_TEST_PRICE_TOKEN_ADDRESS)
      expect(stored[0]?.seller).toBe(getAddress(SELLER_ADDRESS))
    })

    it("resolves receiptTokenAddress and priceTokenAddress from tokenSet lookup", async () => {
      const customReceiptToken = "0x5555555555555555555555555555555555555555"
      const customPriceToken = "0x6666666666666666666666666666666666666666"

      await insertTestPair()
      await insertTestBond({
        vaultId: Number(COLLECTION_ID),
        receiptTokenAddress: getAddress(customReceiptToken),
      })
      await insertTestTokenSet({
        receiptTokenAddress: getAddress(customReceiptToken),
        priceTokenAddress: getAddress(customPriceToken),
      })

      const event = buildListingCreatedEvent(
        {
          listingId: LISTING_ID,
          owner: SELLER_ADDRESS as `0x${string}`,
          tokenSetId: TOKEN_SET_ID,
          collectionId: COLLECTION_ID,
          price: PRICE,
          buyer: zeroAddress,
        },
        {
          address: DEFAULT_TEST_MARKETPLACE_ADDRESS,
          chainId: DEFAULT_TEST_CHAIN_ID,
        },
      )

      await handleListingCreated(event)

      const stored = await db
        .select()
        .from(listings)
        .where(eq(listings.chainId, DEFAULT_TEST_CHAIN_ID))

      expect(stored).toHaveLength(1)
      expect(stored[0]?.receiptTokenAddress).toBe(getAddress(customReceiptToken))
      expect(stored[0]?.priceTokenAddress).toBe(getAddress(customPriceToken))
    })

    it("sets status to active and quantity to 1", async () => {
      await insertTestPair()
      await insertTestBond({
        vaultId: Number(COLLECTION_ID),
        receiptTokenAddress: DEFAULT_TEST_RECEIPT_TOKEN_ADDRESS,
      })
      await insertTestTokenSet()

      const event = buildListingCreatedEvent(
        {
          listingId: LISTING_ID,
          owner: SELLER_ADDRESS as `0x${string}`,
          tokenSetId: TOKEN_SET_ID,
          collectionId: COLLECTION_ID,
          price: PRICE,
          buyer: zeroAddress,
        },
        {
          address: DEFAULT_TEST_MARKETPLACE_ADDRESS,
          chainId: DEFAULT_TEST_CHAIN_ID,
        },
      )

      await handleListingCreated(event)

      const stored = await db
        .select()
        .from(listings)
        .where(eq(listings.chainId, DEFAULT_TEST_CHAIN_ID))

      expect(stored).toHaveLength(1)
      expect(stored[0]?.status).toBe("active")
      expect(stored[0]?.quantity).toBe(1)
    })

    it("stores tokenId from collectionId and price correctly", async () => {
      const customCollectionId = 999n
      const customPrice = 5000000000000000000n // 5 tokens

      await insertTestPair()
      await insertTestBond({
        vaultId: Number(customCollectionId),
        receiptTokenAddress: DEFAULT_TEST_RECEIPT_TOKEN_ADDRESS,
      })
      await insertTestTokenSet()

      const event = buildListingCreatedEvent(
        {
          listingId: LISTING_ID,
          owner: SELLER_ADDRESS as `0x${string}`,
          tokenSetId: TOKEN_SET_ID,
          collectionId: customCollectionId,
          price: customPrice,
          buyer: zeroAddress,
        },
        {
          address: DEFAULT_TEST_MARKETPLACE_ADDRESS,
          chainId: DEFAULT_TEST_CHAIN_ID,
        },
      )

      await handleListingCreated(event)

      const stored = await db
        .select()
        .from(listings)
        .where(eq(listings.chainId, DEFAULT_TEST_CHAIN_ID))

      expect(stored).toHaveLength(1)
      expect(stored[0]?.tokenId).toBe(Number(customCollectionId))
      expect(stored[0]?.price).toBe(customPrice)
    })
  })

  describe("buyer handling", () => {
    it("converts zeroAddress buyer to null for public listings", async () => {
      await insertTestPair()
      await insertTestBond({
        vaultId: Number(COLLECTION_ID),
        receiptTokenAddress: DEFAULT_TEST_RECEIPT_TOKEN_ADDRESS,
      })
      await insertTestTokenSet()

      const event = buildListingCreatedEvent(
        {
          listingId: LISTING_ID,
          owner: SELLER_ADDRESS as `0x${string}`,
          tokenSetId: TOKEN_SET_ID,
          collectionId: COLLECTION_ID,
          price: PRICE,
          buyer: zeroAddress,
        },
        {
          address: DEFAULT_TEST_MARKETPLACE_ADDRESS,
          chainId: DEFAULT_TEST_CHAIN_ID,
        },
      )

      await handleListingCreated(event)

      const stored = await db
        .select()
        .from(listings)
        .where(eq(listings.chainId, DEFAULT_TEST_CHAIN_ID))

      expect(stored).toHaveLength(1)
      expect(stored[0]?.buyer).toBeNull()
    })

    it("stores actual buyer address for private listings", async () => {
      await insertTestPair()
      await insertTestBond({
        vaultId: Number(COLLECTION_ID),
        receiptTokenAddress: DEFAULT_TEST_RECEIPT_TOKEN_ADDRESS,
      })
      await insertTestTokenSet()

      const event = buildListingCreatedEvent(
        {
          listingId: LISTING_ID,
          owner: SELLER_ADDRESS as `0x${string}`,
          tokenSetId: TOKEN_SET_ID,
          collectionId: COLLECTION_ID,
          price: PRICE,
          buyer: BUYER_ADDRESS as `0x${string}`,
        },
        {
          address: DEFAULT_TEST_MARKETPLACE_ADDRESS,
          chainId: DEFAULT_TEST_CHAIN_ID,
        },
      )

      await handleListingCreated(event)

      const stored = await db
        .select()
        .from(listings)
        .where(eq(listings.chainId, DEFAULT_TEST_CHAIN_ID))

      expect(stored).toHaveLength(1)
      expect(stored[0]?.buyer).toBe(getAddress(BUYER_ADDRESS))
    })
  })

  describe("error handling", () => {
    it("throws error when tokenSet not found", async () => {
      await insertTestPair()
      await insertTestBond({
        vaultId: Number(COLLECTION_ID),
        receiptTokenAddress: DEFAULT_TEST_RECEIPT_TOKEN_ADDRESS,
      })
      // Deliberately NOT inserting tokenSet

      const event = buildListingCreatedEvent(
        {
          listingId: LISTING_ID,
          owner: SELLER_ADDRESS as `0x${string}`,
          tokenSetId: TOKEN_SET_ID,
          collectionId: COLLECTION_ID,
          price: PRICE,
          buyer: zeroAddress,
        },
        {
          address: DEFAULT_TEST_MARKETPLACE_ADDRESS,
          chainId: DEFAULT_TEST_CHAIN_ID,
        },
      )

      await expect(handleListingCreated(event)).rejects.toThrow(
        `TokenSet not found: chainId=${DEFAULT_TEST_CHAIN_ID}, marketplace=${DEFAULT_TEST_MARKETPLACE_ADDRESS}, tokenSetId=${TOKEN_SET_ID}`,
      )
    })

    it("throws error when blockNumber is null", async () => {
      await insertTestPair()
      await insertTestBond({
        vaultId: Number(COLLECTION_ID),
        receiptTokenAddress: DEFAULT_TEST_RECEIPT_TOKEN_ADDRESS,
      })
      await insertTestTokenSet()

      const event = buildListingCreatedEvent(
        {
          listingId: LISTING_ID,
          owner: SELLER_ADDRESS as `0x${string}`,
          tokenSetId: TOKEN_SET_ID,
          collectionId: COLLECTION_ID,
          price: PRICE,
          buyer: zeroAddress,
        },
        {
          address: DEFAULT_TEST_MARKETPLACE_ADDRESS,
          chainId: DEFAULT_TEST_CHAIN_ID,
          transactionHash: "0xdeadbeef00000000000000000000000000000000000000000000000000000000",
        },
      )

      // Explicitly set blockNumber to null to test runtime behavior
      ;(event as any).blockNumber = null

      await expect(handleListingCreated(event)).rejects.toThrow(
        "Missing required event metadata for ListingCreated event",
      )
    })

    it("throws error when blockTimestamp is undefined", async () => {
      await insertTestPair()
      await insertTestBond({
        vaultId: Number(COLLECTION_ID),
        receiptTokenAddress: DEFAULT_TEST_RECEIPT_TOKEN_ADDRESS,
      })
      await insertTestTokenSet()

      const event = buildListingCreatedEvent(
        {
          listingId: LISTING_ID,
          owner: SELLER_ADDRESS as `0x${string}`,
          tokenSetId: TOKEN_SET_ID,
          collectionId: COLLECTION_ID,
          price: PRICE,
          buyer: zeroAddress,
        },
        {
          address: DEFAULT_TEST_MARKETPLACE_ADDRESS,
          chainId: DEFAULT_TEST_CHAIN_ID,
          transactionHash: "0xdeadbeef00000000000000000000000000000000000000000000000000000000",
        },
      )

      // Explicitly remove blockTimestamp to test runtime behavior
      event.blockTimestamp = undefined

      await expect(handleListingCreated(event)).rejects.toThrow(
        "Missing required event metadata for ListingCreated event",
      )
    })
  })

  describe("idempotency", () => {
    it("is idempotent - processing same event twice produces same result", async () => {
      await insertTestPair()
      await insertTestBond({
        vaultId: Number(COLLECTION_ID),
        receiptTokenAddress: DEFAULT_TEST_RECEIPT_TOKEN_ADDRESS,
      })
      await insertTestTokenSet()

      const event = buildListingCreatedEvent(
        {
          listingId: LISTING_ID,
          owner: SELLER_ADDRESS as `0x${string}`,
          tokenSetId: TOKEN_SET_ID,
          collectionId: COLLECTION_ID,
          price: PRICE,
          buyer: zeroAddress,
        },
        {
          address: DEFAULT_TEST_MARKETPLACE_ADDRESS,
          chainId: DEFAULT_TEST_CHAIN_ID,
        },
      )

      await handleListingCreated(event)
      await handleListingCreated(event)

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
    })

    it("does not update existing listing on conflict", async () => {
      await insertTestPair()
      await insertTestBond({
        vaultId: Number(COLLECTION_ID),
        receiptTokenAddress: DEFAULT_TEST_RECEIPT_TOKEN_ADDRESS,
      })
      await insertTestTokenSet()

      const originalPrice = 1000n
      const newPrice = 9999n

      const originalEvent = buildListingCreatedEvent(
        {
          listingId: LISTING_ID,
          owner: SELLER_ADDRESS as `0x${string}`,
          tokenSetId: TOKEN_SET_ID,
          collectionId: COLLECTION_ID,
          price: originalPrice,
          buyer: zeroAddress,
        },
        {
          address: DEFAULT_TEST_MARKETPLACE_ADDRESS,
          chainId: DEFAULT_TEST_CHAIN_ID,
        },
      )

      const conflictingEvent = buildListingCreatedEvent(
        {
          listingId: LISTING_ID,
          owner: SELLER_ADDRESS as `0x${string}`,
          tokenSetId: TOKEN_SET_ID,
          collectionId: COLLECTION_ID,
          price: newPrice,
          buyer: BUYER_ADDRESS as `0x${string}`,
        },
        {
          address: DEFAULT_TEST_MARKETPLACE_ADDRESS,
          chainId: DEFAULT_TEST_CHAIN_ID,
        },
      )

      await handleListingCreated(originalEvent)
      await handleListingCreated(conflictingEvent)

      const stored = await db
        .select()
        .from(listings)
        .where(eq(listings.chainId, DEFAULT_TEST_CHAIN_ID))

      expect(stored).toHaveLength(1)
      expect(stored[0]?.price).toBe(originalPrice)
      expect(stored[0]?.buyer).toBeNull() // Original had zeroAddress
    })
  })

  describe("multiple listings", () => {
    it("handles multiple listings with different IDs", async () => {
      await insertTestPair()
      await insertTestBond({
        vaultId: Number(COLLECTION_ID),
        receiptTokenAddress: DEFAULT_TEST_RECEIPT_TOKEN_ADDRESS,
      })
      await insertTestTokenSet()

      const event1 = buildListingCreatedEvent(
        {
          listingId: 1n,
          owner: SELLER_ADDRESS as `0x${string}`,
          tokenSetId: TOKEN_SET_ID,
          collectionId: COLLECTION_ID,
          price: PRICE,
          buyer: zeroAddress,
        },
        {
          address: DEFAULT_TEST_MARKETPLACE_ADDRESS,
          chainId: DEFAULT_TEST_CHAIN_ID,
        },
      )

      const event2 = buildListingCreatedEvent(
        {
          listingId: 2n,
          owner: SELLER_ADDRESS as `0x${string}`,
          tokenSetId: TOKEN_SET_ID,
          collectionId: COLLECTION_ID,
          price: PRICE * 2n,
          buyer: zeroAddress,
        },
        {
          address: DEFAULT_TEST_MARKETPLACE_ADDRESS,
          chainId: DEFAULT_TEST_CHAIN_ID,
        },
      )

      await handleListingCreated(event1)
      await handleListingCreated(event2)

      const stored = await db
        .select()
        .from(listings)
        .where(eq(listings.chainId, DEFAULT_TEST_CHAIN_ID))

      expect(stored).toHaveLength(2)
      expect(stored.map((l) => l.listingId).toSorted()).toEqual([1, 2])
    })

    it("handles listings from different marketplaces", async () => {
      const otherMarketplace = "0x7777777777777777777777777777777777777777"

      await insertTestPair()
      await insertTestBond({
        vaultId: Number(COLLECTION_ID),
        receiptTokenAddress: DEFAULT_TEST_RECEIPT_TOKEN_ADDRESS,
      })
      await insertTestTokenSet()
      await insertTestTokenSet({
        marketplaceAddress: getAddress(otherMarketplace),
      })

      const event1 = buildListingCreatedEvent(
        {
          listingId: LISTING_ID,
          owner: SELLER_ADDRESS as `0x${string}`,
          tokenSetId: TOKEN_SET_ID,
          collectionId: COLLECTION_ID,
          price: PRICE,
          buyer: zeroAddress,
        },
        {
          address: DEFAULT_TEST_MARKETPLACE_ADDRESS,
          chainId: DEFAULT_TEST_CHAIN_ID,
        },
      )

      const event2 = buildListingCreatedEvent(
        {
          listingId: LISTING_ID, // Same listing ID but different marketplace
          owner: SELLER_ADDRESS as `0x${string}`,
          tokenSetId: TOKEN_SET_ID,
          collectionId: COLLECTION_ID,
          price: PRICE,
          buyer: zeroAddress,
        },
        {
          address: otherMarketplace,
          chainId: DEFAULT_TEST_CHAIN_ID,
        },
      )

      await handleListingCreated(event1)
      await handleListingCreated(event2)

      const stored = await db
        .select()
        .from(listings)
        .where(eq(listings.chainId, DEFAULT_TEST_CHAIN_ID))

      expect(stored).toHaveLength(2)
      expect(stored.map((l) => l.marketplaceAddress).toSorted()).toEqual([
        getAddress(otherMarketplace),
        DEFAULT_TEST_MARKETPLACE_ADDRESS,
      ])
    })
  })
})

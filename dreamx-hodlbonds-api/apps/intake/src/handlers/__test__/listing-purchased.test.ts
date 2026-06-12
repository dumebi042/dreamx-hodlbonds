/**
 * Tests for ListingPurchased event handler
 * Verifies listing status update, buyer set, balance transfers, error handling,
 * idempotency, and atomicity
 */

import { faker } from "@faker-js/faker"
import { getDb } from "@hodlbonds-api/db"
import { listings, receiptTokenBalances, schema } from "@hodlbonds-api/db/schema/index"
import { and, eq } from "drizzle-orm"
import { reset } from "drizzle-seed"
import { getAddress } from "viem"
import { beforeEach, describe, expect, it } from "vitest"

import {
  DEFAULT_TEST_CHAIN_ID,
  DEFAULT_TEST_MARKETPLACE_ADDRESS,
  DEFAULT_TEST_PRICE_TOKEN_ADDRESS,
  DEFAULT_TEST_RECEIPT_TOKEN_ADDRESS,
  insertTestBalance,
  insertTestBond,
  insertTestListing,
  insertTestPair,
  insertTestTokenSet,
} from "@/test/helpers/bond-builders"
import { buildListingPurchasedEvent } from "@/test/helpers/event-builders"

import { handleListingPurchased } from "../listing-purchased"

const db = getDb()

describe("handleListingPurchased", () => {
  const SELLER_ADDRESS = getAddress("0xdddddddddddddddddddddddddddddddddddddddd")
  const BUYER_ADDRESS = getAddress("0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee")
  const TOKEN_SET_ID = 1n
  const COLLECTION_ID = 42n
  const LISTING_ID = 100n
  const PRICE = 1000000000000000000n // 1 token
  const TOTAL_PRICE = 1050000000000000000n // 1.05 tokens (with fee)

  beforeEach(async () => {
    await reset(db, schema)
  })

  /** Helper to set up standard test data: pair, bond, token set, listing, and seller balance */
  async function setupActiveListingWithBalance(overrides?: {
    listing?: Partial<Parameters<typeof insertTestListing>[0]>
    balance?: Partial<Parameters<typeof insertTestBalance>[0]>
  }) {
    await insertTestPair()
    await insertTestBond({
      vaultId: Number(COLLECTION_ID),
      receiptTokenAddress: DEFAULT_TEST_RECEIPT_TOKEN_ADDRESS,
    })
    await insertTestTokenSet()

    const listing = await insertTestListing({
      listingId: Number(LISTING_ID),
      receiptTokenAddress: DEFAULT_TEST_RECEIPT_TOKEN_ADDRESS,
      tokenId: Number(COLLECTION_ID),
      seller: SELLER_ADDRESS,
      price: PRICE,
      priceTokenAddress: DEFAULT_TEST_PRICE_TOKEN_ADDRESS,
      ...overrides?.listing,
    })

    await insertTestBalance({
      receiptTokenAddress: DEFAULT_TEST_RECEIPT_TOKEN_ADDRESS,
      tokenId: Number(COLLECTION_ID),
      ownerAddress: SELLER_ADDRESS,
      balance: 1n,
      lastUpdateBlockNumber: 14000000,
      lastUpdateBlockTimestamp: new Date("2025-01-01"),
      ...overrides?.balance,
    })

    return listing
  }

  /** Helper to get a listing from the DB */
  async function getListing(listingId: number) {
    const [result] = await db
      .select()
      .from(listings)
      .where(
        and(
          eq(listings.chainId, DEFAULT_TEST_CHAIN_ID),
          eq(listings.marketplaceAddress, DEFAULT_TEST_MARKETPLACE_ADDRESS),
          eq(listings.listingId, listingId),
        ),
      )
      .limit(1)
    return result
  }

  /** Helper to get a balance from the DB */
  async function getBalance(ownerAddress: string) {
    const [result] = await db
      .select()
      .from(receiptTokenBalances)
      .where(
        and(
          eq(receiptTokenBalances.chainId, DEFAULT_TEST_CHAIN_ID),
          eq(receiptTokenBalances.receiptTokenAddress, DEFAULT_TEST_RECEIPT_TOKEN_ADDRESS),
          eq(receiptTokenBalances.tokenId, Number(COLLECTION_ID)),
          eq(receiptTokenBalances.ownerAddress, ownerAddress),
        ),
      )
      .limit(1)
    return result
  }

  describe("update (happy path)", () => {
    it("sets status from active to completed", async () => {
      await setupActiveListingWithBalance()

      const event = buildListingPurchasedEvent(
        {
          listingId: LISTING_ID,
          tokenSetId: TOKEN_SET_ID,
          collectionId: COLLECTION_ID,
          totalPrice: TOTAL_PRICE,
          buyer: BUYER_ADDRESS,
        },
        {
          address: DEFAULT_TEST_MARKETPLACE_ADDRESS,
          chainId: DEFAULT_TEST_CHAIN_ID,
        },
      )

      await handleListingPurchased(event)

      const stored = await getListing(Number(LISTING_ID))
      expect(stored?.status).toBe("completed")
    })

    it("sets buyer from the event args", async () => {
      await setupActiveListingWithBalance()

      const event = buildListingPurchasedEvent(
        {
          listingId: LISTING_ID,
          tokenSetId: TOKEN_SET_ID,
          collectionId: COLLECTION_ID,
          totalPrice: TOTAL_PRICE,
          buyer: BUYER_ADDRESS,
        },
        {
          address: DEFAULT_TEST_MARKETPLACE_ADDRESS,
          chainId: DEFAULT_TEST_CHAIN_ID,
        },
      )

      await handleListingPurchased(event)

      const stored = await getListing(Number(LISTING_ID))
      expect(stored?.buyer).toBe(BUYER_ADDRESS)
    })

    it("sets settledTxHash, settledBlockNumber, and settledBlockTimestamp", async () => {
      await setupActiveListingWithBalance()

      const txHash = faker.string.hexadecimal({ length: 64, prefix: "0x" }) as `0x${string}`
      const blockNumber = 16000000n
      const blockTimestamp = BigInt(Math.floor(Date.now() / 1000))

      const event = buildListingPurchasedEvent(
        {
          listingId: LISTING_ID,
          tokenSetId: TOKEN_SET_ID,
          collectionId: COLLECTION_ID,
          totalPrice: TOTAL_PRICE,
          buyer: BUYER_ADDRESS,
        },
        {
          address: DEFAULT_TEST_MARKETPLACE_ADDRESS,
          chainId: DEFAULT_TEST_CHAIN_ID,
          transactionHash: txHash,
          blockNumber,
          blockTimestamp,
        },
      )

      await handleListingPurchased(event)

      const stored = await getListing(Number(LISTING_ID))
      expect(stored?.settledTxHash).toBe(txHash)
      expect(stored?.settledBlockNumber).toBe(Number(blockNumber))
      expect(stored?.settledBlockTimestamp).toEqual(new Date(Number(blockTimestamp) * 1000))
    })

    it("preserves original listing data after purchase", async () => {
      const originalListing = await setupActiveListingWithBalance()

      const event = buildListingPurchasedEvent(
        {
          listingId: LISTING_ID,
          tokenSetId: TOKEN_SET_ID,
          collectionId: COLLECTION_ID,
          totalPrice: TOTAL_PRICE,
          buyer: BUYER_ADDRESS,
        },
        {
          address: DEFAULT_TEST_MARKETPLACE_ADDRESS,
          chainId: DEFAULT_TEST_CHAIN_ID,
        },
      )

      await handleListingPurchased(event)

      const stored = await getListing(Number(LISTING_ID))
      expect(stored?.seller).toBe(originalListing.seller)
      expect(stored?.price).toBe(originalListing.price)
      expect(stored?.receiptTokenAddress).toBe(originalListing.receiptTokenAddress)
      expect(stored?.priceTokenAddress).toBe(originalListing.priceTokenAddress)
      expect(stored?.tokenId).toBe(originalListing.tokenId)
      expect(stored?.quantity).toBe(originalListing.quantity)
      expect(stored?.txHash).toBe(originalListing.txHash)
      expect(stored?.blockNumber).toBe(originalListing.blockNumber)
    })
  })

  describe("balance transfer", () => {
    it("subtracts quantity from seller balance and deletes when zero", async () => {
      await setupActiveListingWithBalance({ balance: { balance: 1n } })

      const event = buildListingPurchasedEvent(
        {
          listingId: LISTING_ID,
          tokenSetId: TOKEN_SET_ID,
          collectionId: COLLECTION_ID,
          totalPrice: TOTAL_PRICE,
          buyer: BUYER_ADDRESS,
        },
        {
          address: DEFAULT_TEST_MARKETPLACE_ADDRESS,
          chainId: DEFAULT_TEST_CHAIN_ID,
        },
      )

      await handleListingPurchased(event)

      // Seller balance should be deleted (was 1, subtracted 1)
      const sellerBalance = await getBalance(SELLER_ADDRESS)
      expect(sellerBalance).toBeUndefined()
    })

    it("subtracts quantity from seller balance and keeps remainder", async () => {
      await setupActiveListingWithBalance({ balance: { balance: 5n } })

      const blockNumber = 16000000n
      const event = buildListingPurchasedEvent(
        {
          listingId: LISTING_ID,
          tokenSetId: TOKEN_SET_ID,
          collectionId: COLLECTION_ID,
          totalPrice: TOTAL_PRICE,
          buyer: BUYER_ADDRESS,
        },
        {
          address: DEFAULT_TEST_MARKETPLACE_ADDRESS,
          chainId: DEFAULT_TEST_CHAIN_ID,
          blockNumber,
        },
      )

      await handleListingPurchased(event)

      const sellerBalance = await getBalance(SELLER_ADDRESS)
      expect(sellerBalance?.balance).toBe(4n)
    })

    it("adds quantity to buyer balance (new entry)", async () => {
      await setupActiveListingWithBalance()

      const blockNumber = 16000000n
      const blockTimestamp = BigInt(Math.floor(Date.now() / 1000))

      const event = buildListingPurchasedEvent(
        {
          listingId: LISTING_ID,
          tokenSetId: TOKEN_SET_ID,
          collectionId: COLLECTION_ID,
          totalPrice: TOTAL_PRICE,
          buyer: BUYER_ADDRESS,
        },
        {
          address: DEFAULT_TEST_MARKETPLACE_ADDRESS,
          chainId: DEFAULT_TEST_CHAIN_ID,
          blockNumber,
          blockTimestamp,
        },
      )

      await handleListingPurchased(event)

      const buyerBalance = await getBalance(BUYER_ADDRESS)
      expect(buyerBalance).toBeDefined()
      expect(buyerBalance?.balance).toBe(1n)
      expect(buyerBalance?.lastUpdateBlockNumber).toBe(Number(blockNumber))
      expect(buyerBalance?.lastUpdateBlockTimestamp).toEqual(
        new Date(Number(blockTimestamp) * 1000),
      )
    })

    it("adds to existing buyer balance", async () => {
      await setupActiveListingWithBalance()

      // Buyer already has some tokens
      await insertTestBalance({
        receiptTokenAddress: DEFAULT_TEST_RECEIPT_TOKEN_ADDRESS,
        tokenId: Number(COLLECTION_ID),
        ownerAddress: BUYER_ADDRESS,
        balance: 3n,
        lastUpdateBlockNumber: 14000000,
        lastUpdateBlockTimestamp: new Date("2025-01-01"),
      })

      const event = buildListingPurchasedEvent(
        {
          listingId: LISTING_ID,
          tokenSetId: TOKEN_SET_ID,
          collectionId: COLLECTION_ID,
          totalPrice: TOTAL_PRICE,
          buyer: BUYER_ADDRESS,
        },
        {
          address: DEFAULT_TEST_MARKETPLACE_ADDRESS,
          chainId: DEFAULT_TEST_CHAIN_ID,
        },
      )

      await handleListingPurchased(event)

      const buyerBalance = await getBalance(BUYER_ADDRESS)
      expect(buyerBalance?.balance).toBe(4n) // 3 + 1
    })

    it("updates lastUpdateBlockNumber and timestamp when event block is newer", async () => {
      await setupActiveListingWithBalance({
        balance: { balance: 5n, lastUpdateBlockNumber: 14000000 },
      })

      const blockNumber = 16000000n
      const blockTimestamp = BigInt(Math.floor(Date.now() / 1000))

      const event = buildListingPurchasedEvent(
        {
          listingId: LISTING_ID,
          tokenSetId: TOKEN_SET_ID,
          collectionId: COLLECTION_ID,
          totalPrice: TOTAL_PRICE,
          buyer: BUYER_ADDRESS,
        },
        {
          address: DEFAULT_TEST_MARKETPLACE_ADDRESS,
          chainId: DEFAULT_TEST_CHAIN_ID,
          blockNumber,
          blockTimestamp,
        },
      )

      await handleListingPurchased(event)

      const sellerBalance = await getBalance(SELLER_ADDRESS)
      expect(sellerBalance?.balance).toBe(4n)
      expect(sellerBalance?.lastUpdateBlockNumber).toBe(Number(blockNumber))
      expect(sellerBalance?.lastUpdateBlockTimestamp).toEqual(
        new Date(Number(blockTimestamp) * 1000),
      )
    })

    it("does not update timestamps when event block is older (out-of-order)", async () => {
      const existingBlockNumber = 18000000
      const existingTimestamp = new Date("2025-06-01")

      await setupActiveListingWithBalance({
        balance: {
          balance: 5n,
          lastUpdateBlockNumber: existingBlockNumber,
          lastUpdateBlockTimestamp: existingTimestamp,
        },
      })

      // Event has an older block number
      const event = buildListingPurchasedEvent(
        {
          listingId: LISTING_ID,
          tokenSetId: TOKEN_SET_ID,
          collectionId: COLLECTION_ID,
          totalPrice: TOTAL_PRICE,
          buyer: BUYER_ADDRESS,
        },
        {
          address: DEFAULT_TEST_MARKETPLACE_ADDRESS,
          chainId: DEFAULT_TEST_CHAIN_ID,
          blockNumber: 15000000n, // older than existing
        },
      )

      await handleListingPurchased(event)

      const sellerBalance = await getBalance(SELLER_ADDRESS)
      expect(sellerBalance?.balance).toBe(4n) // balance still updated
      expect(sellerBalance?.lastUpdateBlockNumber).toBe(existingBlockNumber) // timestamp preserved
      expect(sellerBalance?.lastUpdateBlockTimestamp).toEqual(existingTimestamp)
    })
  })

  describe("error handling", () => {
    it("throws error when blockNumber is null", async () => {
      await setupActiveListingWithBalance()

      const event = buildListingPurchasedEvent(
        {
          listingId: LISTING_ID,
          tokenSetId: TOKEN_SET_ID,
          collectionId: COLLECTION_ID,
          totalPrice: TOTAL_PRICE,
          buyer: BUYER_ADDRESS,
        },
        {
          address: DEFAULT_TEST_MARKETPLACE_ADDRESS,
          chainId: DEFAULT_TEST_CHAIN_ID,
          transactionHash: "0xdeadbeef00000000000000000000000000000000000000000000000000000000",
        },
      )

      ;(event as any).blockNumber = null

      await expect(handleListingPurchased(event)).rejects.toThrow(
        "Missing required event metadata for ListingPurchased event",
      )
    })

    it("throws error when blockTimestamp is undefined", async () => {
      await setupActiveListingWithBalance()

      const event = buildListingPurchasedEvent(
        {
          listingId: LISTING_ID,
          tokenSetId: TOKEN_SET_ID,
          collectionId: COLLECTION_ID,
          totalPrice: TOTAL_PRICE,
          buyer: BUYER_ADDRESS,
        },
        {
          address: DEFAULT_TEST_MARKETPLACE_ADDRESS,
          chainId: DEFAULT_TEST_CHAIN_ID,
          transactionHash: "0xdeadbeef00000000000000000000000000000000000000000000000000000000",
        },
      )

      event.blockTimestamp = undefined

      await expect(handleListingPurchased(event)).rejects.toThrow(
        "Missing required event metadata for ListingPurchased event",
      )
    })

    it("throws error when listing does not exist", async () => {
      await insertTestPair()
      await insertTestBond({
        vaultId: Number(COLLECTION_ID),
        receiptTokenAddress: DEFAULT_TEST_RECEIPT_TOKEN_ADDRESS,
      })
      await insertTestTokenSet()
      // No listing inserted

      const event = buildListingPurchasedEvent(
        {
          listingId: LISTING_ID,
          tokenSetId: TOKEN_SET_ID,
          collectionId: COLLECTION_ID,
          totalPrice: TOTAL_PRICE,
          buyer: BUYER_ADDRESS,
        },
        {
          address: DEFAULT_TEST_MARKETPLACE_ADDRESS,
          chainId: DEFAULT_TEST_CHAIN_ID,
        },
      )

      await expect(handleListingPurchased(event)).rejects.toThrow(
        `Listing not found: chainId=${DEFAULT_TEST_CHAIN_ID}, marketplace=${DEFAULT_TEST_MARKETPLACE_ADDRESS}, listingId=${LISTING_ID}`,
      )
    })

    it("throws error when seller has no balance entry", async () => {
      // Set up listing but no seller balance
      await insertTestPair()
      await insertTestBond({
        vaultId: Number(COLLECTION_ID),
        receiptTokenAddress: DEFAULT_TEST_RECEIPT_TOKEN_ADDRESS,
      })
      await insertTestTokenSet()
      await insertTestListing({
        listingId: Number(LISTING_ID),
        receiptTokenAddress: DEFAULT_TEST_RECEIPT_TOKEN_ADDRESS,
        tokenId: Number(COLLECTION_ID),
        seller: SELLER_ADDRESS,
        price: PRICE,
        priceTokenAddress: DEFAULT_TEST_PRICE_TOKEN_ADDRESS,
      })

      const event = buildListingPurchasedEvent(
        {
          listingId: LISTING_ID,
          tokenSetId: TOKEN_SET_ID,
          collectionId: COLLECTION_ID,
          totalPrice: TOTAL_PRICE,
          buyer: BUYER_ADDRESS,
        },
        {
          address: DEFAULT_TEST_MARKETPLACE_ADDRESS,
          chainId: DEFAULT_TEST_CHAIN_ID,
        },
      )

      await expect(handleListingPurchased(event)).rejects.toThrow(
        `Missing balance entry for seller ${SELLER_ADDRESS}`,
      )
    })
  })

  describe("idempotency", () => {
    it("is idempotent - processing same purchase event twice is a no-op on second call", async () => {
      await setupActiveListingWithBalance()

      const txHash = faker.string.hexadecimal({ length: 64, prefix: "0x" }) as `0x${string}`
      const blockNumber = 16000000n
      const blockTimestamp = BigInt(Math.floor(Date.now() / 1000))

      const event = buildListingPurchasedEvent(
        {
          listingId: LISTING_ID,
          tokenSetId: TOKEN_SET_ID,
          collectionId: COLLECTION_ID,
          totalPrice: TOTAL_PRICE,
          buyer: BUYER_ADDRESS,
        },
        {
          address: DEFAULT_TEST_MARKETPLACE_ADDRESS,
          chainId: DEFAULT_TEST_CHAIN_ID,
          transactionHash: txHash,
          blockNumber,
          blockTimestamp,
        },
      )

      await handleListingPurchased(event)
      await handleListingPurchased(event) // Second call should be no-op

      // Listing should still be completed with correct data
      const stored = await getListing(Number(LISTING_ID))
      expect(stored?.status).toBe("completed")
      expect(stored?.buyer).toBe(BUYER_ADDRESS)
      expect(stored?.settledTxHash).toBe(txHash)

      // Buyer balance should be 1, not 2 (no double-count)
      const buyerBalance = await getBalance(BUYER_ADDRESS)
      expect(buyerBalance?.balance).toBe(1n)

      // Seller balance should be deleted (not double-subtracted)
      const sellerBalance = await getBalance(SELLER_ADDRESS)
      expect(sellerBalance).toBeUndefined()
    })
  })

  describe("atomicity", () => {
    it("does not update listing status if seller balance is missing (transaction rollback)", async () => {
      // Set up listing but no seller balance
      await insertTestPair()
      await insertTestBond({
        vaultId: Number(COLLECTION_ID),
        receiptTokenAddress: DEFAULT_TEST_RECEIPT_TOKEN_ADDRESS,
      })
      await insertTestTokenSet()
      await insertTestListing({
        listingId: Number(LISTING_ID),
        receiptTokenAddress: DEFAULT_TEST_RECEIPT_TOKEN_ADDRESS,
        tokenId: Number(COLLECTION_ID),
        seller: SELLER_ADDRESS,
        price: PRICE,
        priceTokenAddress: DEFAULT_TEST_PRICE_TOKEN_ADDRESS,
      })

      const event = buildListingPurchasedEvent(
        {
          listingId: LISTING_ID,
          tokenSetId: TOKEN_SET_ID,
          collectionId: COLLECTION_ID,
          totalPrice: TOTAL_PRICE,
          buyer: BUYER_ADDRESS,
        },
        {
          address: DEFAULT_TEST_MARKETPLACE_ADDRESS,
          chainId: DEFAULT_TEST_CHAIN_ID,
        },
      )

      await expect(handleListingPurchased(event)).rejects.toThrow(
        `Missing balance entry for seller ${SELLER_ADDRESS}`,
      )

      // Listing status should still be "active" due to transaction rollback
      const stored = await getListing(Number(LISTING_ID))
      expect(stored?.status).toBe("active")
    })

    it("throws when listing was concurrently modified to non-active status", async () => {
      // Set up a listing that is already "cancelled" — the pre-fetch
      // only guards against "completed", so "cancelled" will pass the
      // idempotency check but fail the UPDATE WHERE status = 'active' guard.
      await insertTestPair()
      await insertTestBond({
        vaultId: Number(COLLECTION_ID),
        receiptTokenAddress: DEFAULT_TEST_RECEIPT_TOKEN_ADDRESS,
      })
      await insertTestTokenSet()
      await insertTestListing({
        listingId: Number(LISTING_ID),
        receiptTokenAddress: DEFAULT_TEST_RECEIPT_TOKEN_ADDRESS,
        tokenId: Number(COLLECTION_ID),
        seller: SELLER_ADDRESS,
        price: PRICE,
        priceTokenAddress: DEFAULT_TEST_PRICE_TOKEN_ADDRESS,
        status: "cancelled",
      })

      await insertTestBalance({
        receiptTokenAddress: DEFAULT_TEST_RECEIPT_TOKEN_ADDRESS,
        tokenId: Number(COLLECTION_ID),
        ownerAddress: SELLER_ADDRESS,
        balance: 1n,
        lastUpdateBlockNumber: 14000000,
        lastUpdateBlockTimestamp: new Date("2025-01-01"),
      })

      const event = buildListingPurchasedEvent(
        {
          listingId: LISTING_ID,
          tokenSetId: TOKEN_SET_ID,
          collectionId: COLLECTION_ID,
          totalPrice: TOTAL_PRICE,
          buyer: BUYER_ADDRESS,
        },
        {
          address: DEFAULT_TEST_MARKETPLACE_ADDRESS,
          chainId: DEFAULT_TEST_CHAIN_ID,
        },
      )

      await expect(handleListingPurchased(event)).rejects.toThrow(
        "Listing may have been concurrently modified",
      )

      // Seller balance should be unchanged due to transaction rollback
      const sellerBalance = await getBalance(SELLER_ADDRESS)
      expect(sellerBalance?.balance).toBe(1n)
    })
  })

  describe("edge cases", () => {
    it("does not affect other listings in the same marketplace", async () => {
      await setupActiveListingWithBalance()

      // Insert a second listing with a different ID
      await insertTestListing({
        listingId: Number(LISTING_ID) + 1,
        receiptTokenAddress: DEFAULT_TEST_RECEIPT_TOKEN_ADDRESS,
        tokenId: Number(COLLECTION_ID),
        seller: SELLER_ADDRESS,
        price: PRICE,
        priceTokenAddress: DEFAULT_TEST_PRICE_TOKEN_ADDRESS,
      })

      const event = buildListingPurchasedEvent(
        {
          listingId: LISTING_ID,
          tokenSetId: TOKEN_SET_ID,
          collectionId: COLLECTION_ID,
          totalPrice: TOTAL_PRICE,
          buyer: BUYER_ADDRESS,
        },
        {
          address: DEFAULT_TEST_MARKETPLACE_ADDRESS,
          chainId: DEFAULT_TEST_CHAIN_ID,
        },
      )

      await handleListingPurchased(event)

      // The purchased listing
      const purchased = await getListing(Number(LISTING_ID))
      expect(purchased?.status).toBe("completed")

      // The other listing should remain active
      const other = await getListing(Number(LISTING_ID) + 1)
      expect(other?.status).toBe("active")
    })

    it("does not affect listings in different marketplaces with the same listingId", async () => {
      const otherMarketplace = getAddress("0x7777777777777777777777777777777777777777")

      await setupActiveListingWithBalance()

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

      const event = buildListingPurchasedEvent(
        {
          listingId: LISTING_ID,
          tokenSetId: TOKEN_SET_ID,
          collectionId: COLLECTION_ID,
          totalPrice: TOTAL_PRICE,
          buyer: BUYER_ADDRESS,
        },
        {
          address: DEFAULT_TEST_MARKETPLACE_ADDRESS,
          chainId: DEFAULT_TEST_CHAIN_ID,
        },
      )

      await handleListingPurchased(event)

      // The listing in the target marketplace should be completed
      const purchased = await getListing(Number(LISTING_ID))
      expect(purchased?.status).toBe("completed")

      // The listing in the other marketplace should remain active
      const [other] = await db
        .select()
        .from(listings)
        .where(
          and(
            eq(listings.chainId, DEFAULT_TEST_CHAIN_ID),
            eq(listings.marketplaceAddress, otherMarketplace),
            eq(listings.listingId, Number(LISTING_ID)),
          ),
        )
        .limit(1)

      expect(other?.status).toBe("active")
    })
  })
})

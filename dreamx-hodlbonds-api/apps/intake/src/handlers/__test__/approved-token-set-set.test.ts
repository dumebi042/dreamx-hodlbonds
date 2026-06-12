/**
 * Tests for ApprovedTokenSetSet event handler
 * Verifies correct insertion and idempotency behavior for marketplace token set data
 */

import { faker } from "@faker-js/faker"
import { getDb } from "@hodlbonds-api/db"
import { marketplaceTokenSets, schema } from "@hodlbonds-api/db/schema/index"
import { and, eq } from "drizzle-orm"
import { reset } from "drizzle-seed"
import { getAddress } from "viem"
import { beforeEach, describe, expect, it } from "vitest"

import { buildApprovedTokenSetSetEvent } from "@/test/helpers/event-builders"

import { handleApprovedTokenSetSet } from "../approved-token-set-set"

const db = getDb()

describe("handleApprovedTokenSetSet", () => {
  // Test addresses (lowercase to test checksumming)
  const MARKETPLACE_ADDRESS = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as `0x${string}`
  const ERC1155_ADDRESS = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as `0x${string}`
  const TRADE_TOKEN_ADDRESS = "0xcccccccccccccccccccccccccccccccccccccccc" as `0x${string}`
  const CHAIN_ID = 43114
  const TOKEN_SET_ID = 1n

  beforeEach(async () => {
    await reset(db, schema)
  })

  describe("insert (new token set)", () => {
    it("inserts token set with correct primary key fields", async () => {
      const event = buildApprovedTokenSetSetEvent(
        {
          tokenSetId: TOKEN_SET_ID,
          erc1155Address: ERC1155_ADDRESS,
          tradeTokenAddress: TRADE_TOKEN_ADDRESS,
        },
        {
          address: MARKETPLACE_ADDRESS,
          chainId: CHAIN_ID,
        },
      )

      await handleApprovedTokenSetSet(event)

      const stored = await db
        .select()
        .from(marketplaceTokenSets)
        .where(
          and(
            eq(marketplaceTokenSets.chainId, CHAIN_ID),
            eq(marketplaceTokenSets.marketplaceAddress, getAddress(MARKETPLACE_ADDRESS)),
            eq(marketplaceTokenSets.tokenSetId, Number(TOKEN_SET_ID)),
          ),
        )

      expect(stored).toHaveLength(1)
      expect(stored[0]?.chainId).toBe(CHAIN_ID)
      expect(stored[0]?.marketplaceAddress).toBe(getAddress(MARKETPLACE_ADDRESS))
      expect(stored[0]?.tokenSetId).toBe(Number(TOKEN_SET_ID))
    })

    it("inserts token set with checksummed addresses", async () => {
      const event = buildApprovedTokenSetSetEvent(
        {
          tokenSetId: TOKEN_SET_ID,
          erc1155Address: ERC1155_ADDRESS,
          tradeTokenAddress: TRADE_TOKEN_ADDRESS,
        },
        {
          address: MARKETPLACE_ADDRESS,
          chainId: CHAIN_ID,
        },
      )

      await handleApprovedTokenSetSet(event)

      const stored = await db
        .select()
        .from(marketplaceTokenSets)
        .where(
          and(
            eq(marketplaceTokenSets.chainId, CHAIN_ID),
            eq(marketplaceTokenSets.marketplaceAddress, getAddress(MARKETPLACE_ADDRESS)),
            eq(marketplaceTokenSets.tokenSetId, Number(TOKEN_SET_ID)),
          ),
        )

      expect(stored).toHaveLength(1)
      expect(stored[0]?.marketplaceAddress).toBe(getAddress(MARKETPLACE_ADDRESS))
      expect(stored[0]?.receiptTokenAddress).toBe(getAddress(ERC1155_ADDRESS))
      expect(stored[0]?.priceTokenAddress).toBe(getAddress(TRADE_TOKEN_ADDRESS))
    })

    it("maps erc1155Address to receiptTokenAddress and tradeTokenAddress to priceTokenAddress", async () => {
      const customErc1155 = "0x5555555555555555555555555555555555555555"
      const customTradeToken = "0x6666666666666666666666666666666666666666"

      const event = buildApprovedTokenSetSetEvent(
        {
          tokenSetId: TOKEN_SET_ID,
          erc1155Address: customErc1155,
          tradeTokenAddress: customTradeToken,
        },
        {
          address: MARKETPLACE_ADDRESS,
          chainId: CHAIN_ID,
        },
      )

      await handleApprovedTokenSetSet(event)

      const stored = await db
        .select()
        .from(marketplaceTokenSets)
        .where(eq(marketplaceTokenSets.chainId, CHAIN_ID))

      expect(stored).toHaveLength(1)
      expect(stored[0]?.receiptTokenAddress).toBe(getAddress(customErc1155))
      expect(stored[0]?.priceTokenAddress).toBe(getAddress(customTradeToken))
    })

    it("inserts multiple token sets with different IDs", async () => {
      const event1 = buildApprovedTokenSetSetEvent(
        {
          tokenSetId: 1n,
          erc1155Address: ERC1155_ADDRESS,
          tradeTokenAddress: TRADE_TOKEN_ADDRESS,
        },
        {
          address: MARKETPLACE_ADDRESS,
          chainId: CHAIN_ID,
        },
      )

      const event2 = buildApprovedTokenSetSetEvent(
        {
          tokenSetId: 2n,
          erc1155Address: faker.finance.ethereumAddress() as `0x${string}`,
          tradeTokenAddress: faker.finance.ethereumAddress() as `0x${string}`,
        },
        {
          address: MARKETPLACE_ADDRESS,
          chainId: CHAIN_ID,
        },
      )

      await handleApprovedTokenSetSet(event1)
      await handleApprovedTokenSetSet(event2)

      const stored = await db
        .select()
        .from(marketplaceTokenSets)
        .where(eq(marketplaceTokenSets.chainId, CHAIN_ID))

      expect(stored).toHaveLength(2)
      expect(stored.map((ts) => ts.tokenSetId).toSorted()).toEqual([1, 2])
    })
  })

  describe("idempotency", () => {
    it("is idempotent - processing same event twice produces same result", async () => {
      const event = buildApprovedTokenSetSetEvent(
        {
          tokenSetId: TOKEN_SET_ID,
          erc1155Address: ERC1155_ADDRESS,
          tradeTokenAddress: TRADE_TOKEN_ADDRESS,
        },
        {
          address: MARKETPLACE_ADDRESS,
          chainId: CHAIN_ID,
        },
      )

      await handleApprovedTokenSetSet(event)
      await handleApprovedTokenSetSet(event)

      const stored = await db
        .select()
        .from(marketplaceTokenSets)
        .where(
          and(
            eq(marketplaceTokenSets.chainId, CHAIN_ID),
            eq(marketplaceTokenSets.marketplaceAddress, getAddress(MARKETPLACE_ADDRESS)),
            eq(marketplaceTokenSets.tokenSetId, Number(TOKEN_SET_ID)),
          ),
        )

      expect(stored).toHaveLength(1)
    })

    it("updates existing token set on conflict", async () => {
      const initialEvent = buildApprovedTokenSetSetEvent(
        {
          tokenSetId: TOKEN_SET_ID,
          erc1155Address: ERC1155_ADDRESS,
          tradeTokenAddress: TRADE_TOKEN_ADDRESS,
        },
        {
          address: MARKETPLACE_ADDRESS,
          chainId: CHAIN_ID,
        },
      )
      await handleApprovedTokenSetSet(initialEvent)

      // Update with new addresses - should be applied
      const newErc1155 = "0x5555555555555555555555555555555555555555"
      const newTradeToken = "0x6666666666666666666666666666666666666666"
      const duplicateEvent = buildApprovedTokenSetSetEvent(
        {
          tokenSetId: TOKEN_SET_ID,
          erc1155Address: newErc1155,
          tradeTokenAddress: newTradeToken,
        },
        {
          address: MARKETPLACE_ADDRESS,
          chainId: CHAIN_ID,
        },
      )
      await handleApprovedTokenSetSet(duplicateEvent)

      const stored = await db
        .select()
        .from(marketplaceTokenSets)
        .where(
          and(
            eq(marketplaceTokenSets.chainId, CHAIN_ID),
            eq(marketplaceTokenSets.marketplaceAddress, getAddress(MARKETPLACE_ADDRESS)),
            eq(marketplaceTokenSets.tokenSetId, Number(TOKEN_SET_ID)),
          ),
        )

      // Should have updated values
      expect(stored).toHaveLength(1)
      expect(stored[0]?.receiptTokenAddress).toBe(getAddress(newErc1155))
      expect(stored[0]?.priceTokenAddress).toBe(getAddress(newTradeToken))
    })
  })

  describe("cross-chain isolation", () => {
    it("same token set ID on different chains creates separate records", async () => {
      const event1 = buildApprovedTokenSetSetEvent(
        {
          tokenSetId: TOKEN_SET_ID,
          erc1155Address: ERC1155_ADDRESS,
          tradeTokenAddress: TRADE_TOKEN_ADDRESS,
        },
        {
          address: MARKETPLACE_ADDRESS,
          chainId: 1, // Ethereum mainnet
        },
      )

      const event2 = buildApprovedTokenSetSetEvent(
        {
          tokenSetId: TOKEN_SET_ID,
          erc1155Address: ERC1155_ADDRESS,
          tradeTokenAddress: TRADE_TOKEN_ADDRESS,
        },
        {
          address: MARKETPLACE_ADDRESS,
          chainId: 43114, // Avalanche
        },
      )

      await handleApprovedTokenSetSet(event1)
      await handleApprovedTokenSetSet(event2)

      const stored = await db.select().from(marketplaceTokenSets)

      expect(stored).toHaveLength(2)
      expect(stored.map((ts) => ts.chainId).toSorted()).toEqual([1, 43114])
    })
  })
})

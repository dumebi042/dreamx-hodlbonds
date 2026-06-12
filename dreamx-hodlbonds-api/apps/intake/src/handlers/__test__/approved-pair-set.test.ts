/**
 * Tests for ApprovedPairSet event handler
 * Verifies correct insertion and idempotency behavior for pair data
 */

import { faker } from "@faker-js/faker"
import { getDb } from "@hodlbonds-api/db"
import { pairs, schema } from "@hodlbonds-api/db/schema/index"
import { and, eq } from "drizzle-orm"
import { reset } from "drizzle-seed"
import { getAddress } from "viem"
import { beforeEach, describe, expect, it } from "vitest"

import { buildApprovedPairSetEvent } from "@/test/helpers/event-builders"

import { handleApprovedPairSet } from "../approved-pair-set"

const db = getDb()

describe("handleApprovedPairSet", () => {
  // Test addresses (lowercase to test checksumming)
  const FACTORY_ADDRESS = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  const STABLE_TOKEN_ADDRESS = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  const VAULT_TOKEN_ADDRESS = "0xcccccccccccccccccccccccccccccccccccccccc"
  const WRAPPED_NATIVE_ADDRESS = "0xdddddddddddddddddddddddddddddddddddddddd"
  const ROUTER_ADDRESS = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
  const TOKEN_PAIR_ADDRESS = "0x1111111111111111111111111111111111111111"
  const ROUTER_V2_ADDRESS = "0x2222222222222222222222222222222222222222"
  const PAIR_ADDRESS = "0x3333333333333333333333333333333333333333"
  const CHAINLINK_ADDRESS = "0x4444444444444444444444444444444444444444"
  const CHAIN_ID = 43114
  const PAIR_ID = 1n

  // Helper to create approved pair object
  const createApprovedPair = (overrides?: {
    stableTokenAddress?: `0x${string}`
    vaultTokenAddress?: `0x${string}`
    wrappedNativeTokenAddress?: `0x${string}`
    routerAddress?: `0x${string}`
    tokenPairAddress?: `0x${string}`
    version?: number
    routerV2Address?: `0x${string}`
    pairAddress?: `0x${string}`
    concentrated?: boolean
    chainlinkPriceOracleAddress?: `0x${string}`
  }) => ({
    stableTokenAddress: STABLE_TOKEN_ADDRESS as `0x${string}`,
    vaultTokenAddress: VAULT_TOKEN_ADDRESS as `0x${string}`,
    wrappedNativeTokenAddress: WRAPPED_NATIVE_ADDRESS as `0x${string}`,
    routerAddress: ROUTER_ADDRESS as `0x${string}`,
    tokenPairAddress: TOKEN_PAIR_ADDRESS as `0x${string}`,
    version: 1,
    routerV2Address: ROUTER_V2_ADDRESS as `0x${string}`,
    pairAddress: PAIR_ADDRESS as `0x${string}`,
    concentrated: false,
    chainlinkPriceOracleAddress: CHAINLINK_ADDRESS as `0x${string}`,
    ...overrides,
  })

  beforeEach(async () => {
    await reset(db, schema)
  })

  describe("insert (new pair)", () => {
    it("inserts pair with correct primary key fields", async () => {
      const event = buildApprovedPairSetEvent(
        {
          sender: faker.finance.ethereumAddress() as `0x${string}`,
          pairId: PAIR_ID,
          approvedPair: createApprovedPair(),
        },
        {
          address: FACTORY_ADDRESS,
          chainId: CHAIN_ID,
        },
      )

      await handleApprovedPairSet(event)

      const stored = await db
        .select()
        .from(pairs)
        .where(
          and(
            eq(pairs.chainId, CHAIN_ID),
            eq(pairs.factoryAddress, getAddress(FACTORY_ADDRESS)),
            eq(pairs.id, Number(PAIR_ID)),
          ),
        )

      expect(stored).toHaveLength(1)
      expect(stored[0]?.chainId).toBe(CHAIN_ID)
      expect(stored[0]?.factoryAddress).toBe(getAddress(FACTORY_ADDRESS))
      expect(stored[0]?.id).toBe(Number(PAIR_ID))
    })

    it("inserts pair with checksummed addresses", async () => {
      const event = buildApprovedPairSetEvent(
        {
          sender: faker.finance.ethereumAddress() as `0x${string}`,
          pairId: PAIR_ID,
          approvedPair: createApprovedPair(),
        },
        {
          address: FACTORY_ADDRESS,
          chainId: CHAIN_ID,
        },
      )

      await handleApprovedPairSet(event)

      const stored = await db
        .select()
        .from(pairs)
        .where(
          and(
            eq(pairs.chainId, CHAIN_ID),
            eq(pairs.factoryAddress, getAddress(FACTORY_ADDRESS)),
            eq(pairs.id, Number(PAIR_ID)),
          ),
        )

      expect(stored).toHaveLength(1)
      // All addresses should be checksummed
      expect(stored[0]?.factoryAddress).toBe(getAddress(FACTORY_ADDRESS))
      expect(stored[0]?.stableTokenAddress).toBe(getAddress(STABLE_TOKEN_ADDRESS))
      expect(stored[0]?.vaultTokenAddress).toBe(getAddress(VAULT_TOKEN_ADDRESS))
      expect(stored[0]?.wrappedNativeTokenAddress).toBe(getAddress(WRAPPED_NATIVE_ADDRESS))
      expect(stored[0]?.routerAddress).toBe(getAddress(ROUTER_ADDRESS))
      expect(stored[0]?.tokenPairAddress).toBe(getAddress(TOKEN_PAIR_ADDRESS))
      expect(stored[0]?.routerV2Address).toBe(getAddress(ROUTER_V2_ADDRESS))
      expect(stored[0]?.pairAddress).toBe(getAddress(PAIR_ADDRESS))
      expect(stored[0]?.chainlinkPriceOracleAddress).toBe(getAddress(CHAINLINK_ADDRESS))
    })

    it("inserts pair with correct approved pair data", async () => {
      const event = buildApprovedPairSetEvent(
        {
          sender: faker.finance.ethereumAddress() as `0x${string}`,
          pairId: PAIR_ID,
          approvedPair: createApprovedPair({
            version: 2,
            concentrated: true,
          }),
        },
        {
          address: FACTORY_ADDRESS,
          chainId: CHAIN_ID,
        },
      )

      await handleApprovedPairSet(event)

      const stored = await db
        .select()
        .from(pairs)
        .where(
          and(
            eq(pairs.chainId, CHAIN_ID),
            eq(pairs.factoryAddress, getAddress(FACTORY_ADDRESS)),
            eq(pairs.id, Number(PAIR_ID)),
          ),
        )

      expect(stored).toHaveLength(1)
      expect(stored[0]?.version).toBe(2)
      expect(stored[0]?.concentrated).toBe(true)
    })

    it("inserts multiple pairs with different IDs", async () => {
      const event1 = buildApprovedPairSetEvent(
        {
          sender: faker.finance.ethereumAddress() as `0x${string}`,
          pairId: 1n,
          approvedPair: createApprovedPair(),
        },
        {
          address: FACTORY_ADDRESS,
          chainId: CHAIN_ID,
        },
      )

      const event2 = buildApprovedPairSetEvent(
        {
          sender: faker.finance.ethereumAddress() as `0x${string}`,
          pairId: 2n,
          approvedPair: createApprovedPair({
            stableTokenAddress: faker.finance.ethereumAddress() as `0x${string}`,
          }),
        },
        {
          address: FACTORY_ADDRESS,
          chainId: CHAIN_ID,
        },
      )

      await handleApprovedPairSet(event1)
      await handleApprovedPairSet(event2)

      const stored = await db.select().from(pairs).where(eq(pairs.chainId, CHAIN_ID))

      expect(stored).toHaveLength(2)
      expect(stored[0]?.id).toBe(1)
      expect(stored[1]?.id).toBe(2)
    })
  })

  describe("idempotency", () => {
    it("is idempotent - processing same event twice produces same result", async () => {
      const event = buildApprovedPairSetEvent(
        {
          sender: faker.finance.ethereumAddress() as `0x${string}`,
          pairId: PAIR_ID,
          approvedPair: createApprovedPair(),
        },
        {
          address: FACTORY_ADDRESS,
          chainId: CHAIN_ID,
        },
      )

      await handleApprovedPairSet(event)
      await handleApprovedPairSet(event)

      const stored = await db
        .select()
        .from(pairs)
        .where(
          and(
            eq(pairs.chainId, CHAIN_ID),
            eq(pairs.factoryAddress, getAddress(FACTORY_ADDRESS)),
            eq(pairs.id, Number(PAIR_ID)),
          ),
        )

      expect(stored).toHaveLength(1)
    })

    it("updates existing pair on conflict", async () => {
      // Insert initial pair
      const initialEvent = buildApprovedPairSetEvent(
        {
          sender: faker.finance.ethereumAddress() as `0x${string}`,
          pairId: PAIR_ID,
          approvedPair: createApprovedPair({
            version: 1,
            concentrated: false,
          }),
        },
        {
          address: FACTORY_ADDRESS,
          chainId: CHAIN_ID,
        },
      )
      await handleApprovedPairSet(initialEvent)

      // Update with new data - should be applied
      const newStableToken = "0x5555555555555555555555555555555555555555" as `0x${string}`
      const duplicateEvent = buildApprovedPairSetEvent(
        {
          sender: faker.finance.ethereumAddress() as `0x${string}`,
          pairId: PAIR_ID,
          approvedPair: createApprovedPair({
            stableTokenAddress: newStableToken,
            version: 2,
            concentrated: true,
          }),
        },
        {
          address: FACTORY_ADDRESS,
          chainId: CHAIN_ID,
        },
      )
      await handleApprovedPairSet(duplicateEvent)

      const stored = await db
        .select()
        .from(pairs)
        .where(
          and(
            eq(pairs.chainId, CHAIN_ID),
            eq(pairs.factoryAddress, getAddress(FACTORY_ADDRESS)),
            eq(pairs.id, Number(PAIR_ID)),
          ),
        )

      // Should have updated values
      expect(stored).toHaveLength(1)
      expect(stored[0]?.stableTokenAddress).toBe(getAddress(newStableToken))
      expect(stored[0]?.version).toBe(2)
      expect(stored[0]?.concentrated).toBe(true)
    })
  })

  describe("cross-chain isolation", () => {
    it("same pair ID on different chains creates separate records", async () => {
      const event1 = buildApprovedPairSetEvent(
        {
          sender: faker.finance.ethereumAddress() as `0x${string}`,
          pairId: PAIR_ID,
          approvedPair: createApprovedPair(),
        },
        {
          address: FACTORY_ADDRESS,
          chainId: 1, // Ethereum mainnet
        },
      )

      const event2 = buildApprovedPairSetEvent(
        {
          sender: faker.finance.ethereumAddress() as `0x${string}`,
          pairId: PAIR_ID,
          approvedPair: createApprovedPair(),
        },
        {
          address: FACTORY_ADDRESS,
          chainId: 43114, // Avalanche
        },
      )

      await handleApprovedPairSet(event1)
      await handleApprovedPairSet(event2)

      const stored = await db.select().from(pairs)

      expect(stored).toHaveLength(2)
      expect(stored.map((p) => p.chainId).toSorted()).toEqual([1, 43114])
    })
  })
})

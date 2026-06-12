/**
 * Tests for FeeCollected event handler
 * Verifies correct insertion of fee collection records
 */

import { faker } from "@faker-js/faker"
import { getDb } from "@hodlbonds-api/db"
import { feesCollected, schema, tokens, tokenUsdPrice } from "@hodlbonds-api/db/schema/index"
import { and, eq } from "drizzle-orm"
import { reset } from "drizzle-seed"
import { getAddress } from "viem"
import { beforeEach, describe, expect, it } from "vitest"

import { buildFeeCollectedEvent } from "@/test/helpers/event-builders"

import { handleFeeCollected } from "../fee-collected"

const db = getDb()

describe("handleFeeCollected", () => {
  // Test addresses (lowercase to test checksumming)
  const VAULT_ADDRESS = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  const RECIPIENT_ADDRESS = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  const TOKEN_ADDRESS = "0xcccccccccccccccccccccccccccccccccccccccc"
  const CHAIN_ID = 43114
  const AMOUNT = 1000000000000000000n // 1 token (18 decimals)

  beforeEach(async () => {
    await reset(db, schema)
  })

  describe("insert (new fee record)", () => {
    it("inserts fee record with correct primary key fields", async () => {
      const txHash = faker.string.hexadecimal({ length: 64, prefix: "0x" }) as `0x${string}`
      const logIndex = 5

      const event = buildFeeCollectedEvent(
        {
          to: RECIPIENT_ADDRESS as `0x${string}`,
          token: TOKEN_ADDRESS as `0x${string}`,
          amount: AMOUNT,
        },
        {
          address: VAULT_ADDRESS,
          chainId: CHAIN_ID,
          transactionHash: txHash,
          logIndex,
        },
      )

      await handleFeeCollected(event)

      const stored = await db
        .select()
        .from(feesCollected)
        .where(
          and(
            eq(feesCollected.chainId, CHAIN_ID),
            eq(feesCollected.txHash, txHash),
            eq(feesCollected.logIndex, logIndex),
          ),
        )

      expect(stored).toHaveLength(1)
      expect(stored[0]?.chainId).toBe(CHAIN_ID)
      expect(stored[0]?.txHash).toBe(txHash)
      expect(stored[0]?.logIndex).toBe(logIndex)
    })

    it("inserts fee record with checksummed addresses", async () => {
      const event = buildFeeCollectedEvent(
        {
          to: RECIPIENT_ADDRESS as `0x${string}`,
          token: TOKEN_ADDRESS as `0x${string}`,
          amount: AMOUNT,
        },
        {
          address: VAULT_ADDRESS,
          chainId: CHAIN_ID,
        },
      )

      await handleFeeCollected(event)

      const stored = await db.select().from(feesCollected)

      expect(stored).toHaveLength(1)
      expect(stored[0]?.vaultAddress).toBe(getAddress(VAULT_ADDRESS))
      expect(stored[0]?.recipientAddress).toBe(getAddress(RECIPIENT_ADDRESS))
      expect(stored[0]?.tokenAddress).toBe(getAddress(TOKEN_ADDRESS))
    })

    it("inserts fee record with correct amount and timestamp", async () => {
      const blockTimestamp = BigInt(Math.floor(Date.now() / 1000))
      const blockNumber = BigInt(12345678)

      const event = buildFeeCollectedEvent(
        {
          to: RECIPIENT_ADDRESS as `0x${string}`,
          token: TOKEN_ADDRESS as `0x${string}`,
          amount: AMOUNT,
        },
        {
          address: VAULT_ADDRESS,
          chainId: CHAIN_ID,
          blockTimestamp,
          blockNumber,
        },
      )

      await handleFeeCollected(event)

      const stored = await db.select().from(feesCollected)

      expect(stored).toHaveLength(1)
      expect(stored[0]?.amount).toBe(AMOUNT)
      expect(stored[0]?.blockNumber).toBe(Number(blockNumber))
      expect(stored[0]?.blockTimestamp).toEqual(new Date(Number(blockTimestamp) * 1000))
    })

    it("inserts fee record with null usdValue", async () => {
      const event = buildFeeCollectedEvent(
        {
          to: RECIPIENT_ADDRESS as `0x${string}`,
          token: TOKEN_ADDRESS as `0x${string}`,
          amount: AMOUNT,
        },
        {
          address: VAULT_ADDRESS,
          chainId: CHAIN_ID,
        },
      )

      await handleFeeCollected(event)

      const stored = await db.select().from(feesCollected)

      expect(stored).toHaveLength(1)
      expect(stored[0]?.usdValue).toBeNull()
    })

    it("throws error when blockTimestamp is missing", async () => {
      const event = buildFeeCollectedEvent(
        {
          to: RECIPIENT_ADDRESS as `0x${string}`,
          token: TOKEN_ADDRESS as `0x${string}`,
          amount: AMOUNT,
        },
        {
          address: VAULT_ADDRESS,
          chainId: CHAIN_ID,
        },
      )

      // Remove blockTimestamp to simulate missing data
      ;(event as any).blockTimestamp = undefined

      await expect(handleFeeCollected(event)).rejects.toThrow("Missing required event metadata")
    })
  })

  describe("idempotency (duplicate handling)", () => {
    it("does not insert duplicate record for same primary key", async () => {
      const txHash = faker.string.hexadecimal({ length: 64, prefix: "0x" }) as `0x${string}`
      const logIndex = 3

      const event = buildFeeCollectedEvent(
        {
          to: RECIPIENT_ADDRESS as `0x${string}`,
          token: TOKEN_ADDRESS as `0x${string}`,
          amount: AMOUNT,
        },
        {
          address: VAULT_ADDRESS,
          chainId: CHAIN_ID,
          transactionHash: txHash,
          logIndex,
        },
      )

      // Process same event twice
      await handleFeeCollected(event)
      await handleFeeCollected(event)

      const stored = await db.select().from(feesCollected)

      expect(stored).toHaveLength(1)
    })

    it("inserts multiple fee records with different log indexes in same transaction", async () => {
      const txHash = faker.string.hexadecimal({ length: 64, prefix: "0x" }) as `0x${string}`

      const event1 = buildFeeCollectedEvent(
        {
          to: RECIPIENT_ADDRESS as `0x${string}`,
          token: TOKEN_ADDRESS as `0x${string}`,
          amount: AMOUNT,
        },
        {
          address: VAULT_ADDRESS,
          chainId: CHAIN_ID,
          transactionHash: txHash,
          logIndex: 1,
        },
      )

      const event2 = buildFeeCollectedEvent(
        {
          to: RECIPIENT_ADDRESS as `0x${string}`,
          token: TOKEN_ADDRESS as `0x${string}`,
          amount: AMOUNT * 2n,
        },
        {
          address: VAULT_ADDRESS,
          chainId: CHAIN_ID,
          transactionHash: txHash,
          logIndex: 2,
        },
      )

      await handleFeeCollected(event1)
      await handleFeeCollected(event2)

      const stored = await db.select().from(feesCollected)

      expect(stored).toHaveLength(2)
    })
  })

  describe("cross-chain isolation", () => {
    it("same txHash on different chains creates separate records", async () => {
      const txHash = faker.string.hexadecimal({ length: 64, prefix: "0x" }) as `0x${string}`
      const logIndex = 0

      const eventChain1 = buildFeeCollectedEvent(
        {
          to: RECIPIENT_ADDRESS as `0x${string}`,
          token: TOKEN_ADDRESS as `0x${string}`,
          amount: AMOUNT,
        },
        {
          address: VAULT_ADDRESS,
          chainId: 43114,
          transactionHash: txHash,
          logIndex,
        },
      )

      const eventChain2 = buildFeeCollectedEvent(
        {
          to: RECIPIENT_ADDRESS as `0x${string}`,
          token: TOKEN_ADDRESS as `0x${string}`,
          amount: AMOUNT * 2n,
        },
        {
          address: VAULT_ADDRESS,
          chainId: 8453,
          transactionHash: txHash,
          logIndex,
        },
      )

      await handleFeeCollected(eventChain1)
      await handleFeeCollected(eventChain2)

      const stored = await db.select().from(feesCollected)

      expect(stored).toHaveLength(2)
      expect(stored.find((r) => r.chainId === 43114)?.amount).toBe(AMOUNT)
      expect(stored.find((r) => r.chainId === 8453)?.amount).toBe(AMOUNT * 2n)
    })
  })

  describe("USD value calculation", () => {
    const TOKEN_18_DECIMALS = getAddress("0xdddddddddddddddddddddddddddddddddddddddd")
    const TOKEN_8_DECIMALS = getAddress("0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee")

    it("calculates correct USD value with 18 decimal token", async () => {
      // Setup: Token with 18 decimals, price of $3,000
      await db.insert(tokens).values({
        chainId: CHAIN_ID,
        address: TOKEN_18_DECIMALS,
        symbol: "ETH",
        name: "Ethereum",
        decimals: 18,
      })

      const priceTimestamp = new Date("2025-01-01T12:00:00Z")
      await db.insert(tokenUsdPrice).values({
        chainId: CHAIN_ID,
        tokenAddress: TOKEN_18_DECIMALS,
        usdPrice: 3_000_000_000n, // $3,000 in micro-dollars (6 decimals)
        oracleUpdatedAt: priceTimestamp,
      })

      const blockTimestamp = BigInt(Math.floor(priceTimestamp.getTime() / 1000) + 60) // 1 minute later
      const amount = 2_000_000_000_000_000_000n // 2 tokens (18 decimals)

      const event = buildFeeCollectedEvent(
        {
          to: RECIPIENT_ADDRESS as `0x${string}`,
          token: TOKEN_18_DECIMALS,
          amount,
        },
        {
          address: VAULT_ADDRESS,
          chainId: CHAIN_ID,
          blockTimestamp,
        },
      )

      await handleFeeCollected(event)

      const stored = await db.select().from(feesCollected)
      expect(stored).toHaveLength(1)
      // 2 tokens * $3,000 = $6,000 = 6_000_000_000 micro-dollars
      expect(stored[0]?.usdValue).toBe(6_000_000_000n)
    })

    it("calculates correct USD value with 8 decimal token", async () => {
      // Setup: Token with 8 decimals (like WBTC), price of $60,000
      await db.insert(tokens).values({
        chainId: CHAIN_ID,
        address: TOKEN_8_DECIMALS,
        symbol: "WBTC",
        name: "Wrapped Bitcoin",
        decimals: 8,
      })

      const priceTimestamp = new Date("2025-01-01T12:00:00Z")
      await db.insert(tokenUsdPrice).values({
        chainId: CHAIN_ID,
        tokenAddress: TOKEN_8_DECIMALS,
        usdPrice: 60_000_000_000n, // $60,000 in micro-dollars
        oracleUpdatedAt: priceTimestamp,
      })

      const blockTimestamp = BigInt(Math.floor(priceTimestamp.getTime() / 1000) + 60)
      const amount = 50_000_000n // 0.5 BTC (8 decimals)

      const event = buildFeeCollectedEvent(
        {
          to: RECIPIENT_ADDRESS as `0x${string}`,
          token: TOKEN_8_DECIMALS,
          amount,
        },
        {
          address: VAULT_ADDRESS,
          chainId: CHAIN_ID,
          blockTimestamp,
        },
      )

      await handleFeeCollected(event)

      const stored = await db.select().from(feesCollected)
      expect(stored).toHaveLength(1)
      // 0.5 BTC * $60,000 = $30,000 = 30_000_000_000 micro-dollars
      expect(stored[0]?.usdValue).toBe(30_000_000_000n)
    })

    it("uses most recent price at or before block timestamp", async () => {
      await db.insert(tokens).values({
        chainId: CHAIN_ID,
        address: TOKEN_18_DECIMALS,
        symbol: "ETH",
        name: "Ethereum",
        decimals: 18,
      })

      // Insert 3 prices: old, current, and future
      const oldTimestamp = new Date("2025-01-01T10:00:00Z")
      const currentTimestamp = new Date("2025-01-01T12:00:00Z")
      const futureTimestamp = new Date("2025-01-01T14:00:00Z")

      await db.insert(tokenUsdPrice).values([
        {
          chainId: CHAIN_ID,
          tokenAddress: TOKEN_18_DECIMALS,
          usdPrice: 2_000_000_000n, // $2,000 (old)
          oracleUpdatedAt: oldTimestamp,
        },
        {
          chainId: CHAIN_ID,
          tokenAddress: TOKEN_18_DECIMALS,
          usdPrice: 3_000_000_000n, // $3,000 (current - should use this)
          oracleUpdatedAt: currentTimestamp,
        },
        {
          chainId: CHAIN_ID,
          tokenAddress: TOKEN_18_DECIMALS,
          usdPrice: 4_000_000_000n, // $4,000 (future - should NOT use)
          oracleUpdatedAt: futureTimestamp,
        },
      ])

      // Block timestamp is between current and future
      const blockTimestamp = BigInt(Math.floor(currentTimestamp.getTime() / 1000) + 60) // 1 minute after current
      const amount = 1_000_000_000_000_000_000n // 1 token

      const event = buildFeeCollectedEvent(
        {
          to: RECIPIENT_ADDRESS as `0x${string}`,
          token: TOKEN_18_DECIMALS,
          amount,
        },
        {
          address: VAULT_ADDRESS,
          chainId: CHAIN_ID,
          blockTimestamp,
        },
      )

      await handleFeeCollected(event)

      const stored = await db.select().from(feesCollected)
      expect(stored).toHaveLength(1)
      // Should use $3,000 price (current), not $4,000 (future)
      expect(stored[0]?.usdValue).toBe(3_000_000_000n)
    })

    it("returns null when no price record exists for token", async () => {
      // Token exists but no price data
      await db.insert(tokens).values({
        chainId: CHAIN_ID,
        address: TOKEN_18_DECIMALS,
        symbol: "ETH",
        name: "Ethereum",
        decimals: 18,
      })

      const event = buildFeeCollectedEvent(
        {
          to: RECIPIENT_ADDRESS as `0x${string}`,
          token: TOKEN_18_DECIMALS,
          amount: AMOUNT,
        },
        {
          address: VAULT_ADDRESS,
          chainId: CHAIN_ID,
        },
      )

      await handleFeeCollected(event)

      const stored = await db.select().from(feesCollected)
      expect(stored).toHaveLength(1)
      expect(stored[0]?.usdValue).toBeNull()
    })

    it("returns null when token doesn't exist in tokens table", async () => {
      // Price record exists but no token metadata
      const priceTimestamp = new Date("2025-01-01T12:00:00Z")
      await db.insert(tokenUsdPrice).values({
        chainId: CHAIN_ID,
        tokenAddress: TOKEN_18_DECIMALS,
        usdPrice: 3_000_000_000n,
        oracleUpdatedAt: priceTimestamp,
      })

      const blockTimestamp = BigInt(Math.floor(priceTimestamp.getTime() / 1000) + 60)

      const event = buildFeeCollectedEvent(
        {
          to: RECIPIENT_ADDRESS as `0x${string}`,
          token: TOKEN_18_DECIMALS,
          amount: AMOUNT,
        },
        {
          address: VAULT_ADDRESS,
          chainId: CHAIN_ID,
          blockTimestamp,
        },
      )

      await handleFeeCollected(event)

      const stored = await db.select().from(feesCollected)
      expect(stored).toHaveLength(1)
      expect(stored[0]?.usdValue).toBeNull()
    })

    it("returns null when all price records are newer than block timestamp", async () => {
      await db.insert(tokens).values({
        chainId: CHAIN_ID,
        address: TOKEN_18_DECIMALS,
        symbol: "ETH",
        name: "Ethereum",
        decimals: 18,
      })

      // Price record is in the future relative to block
      const futureTimestamp = new Date("2025-01-01T14:00:00Z")
      await db.insert(tokenUsdPrice).values({
        chainId: CHAIN_ID,
        tokenAddress: TOKEN_18_DECIMALS,
        usdPrice: 3_000_000_000n,
        oracleUpdatedAt: futureTimestamp,
      })

      // Block timestamp is before the price record
      const blockTimestamp = BigInt(Math.floor(futureTimestamp.getTime() / 1000) - 3600) // 1 hour before

      const event = buildFeeCollectedEvent(
        {
          to: RECIPIENT_ADDRESS as `0x${string}`,
          token: TOKEN_18_DECIMALS,
          amount: AMOUNT,
        },
        {
          address: VAULT_ADDRESS,
          chainId: CHAIN_ID,
          blockTimestamp,
        },
      )

      await handleFeeCollected(event)

      const stored = await db.select().from(feesCollected)
      expect(stored).toHaveLength(1)
      expect(stored[0]?.usdValue).toBeNull()
    })
  })
})

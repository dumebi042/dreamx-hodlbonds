import type { Address } from "viem"

import { getDb } from "@hodlbonds-api/db"
import { tokenUsdPrice } from "@hodlbonds-api/db/schema"
import { and, eq } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"

import type { PriceResult } from "../fetch-prices"

import { recordPrices } from "../record-prices"

const db = getDb()

describe("recordPrices", () => {
  const CHAIN_ID = 43114
  const TOKEN_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address
  const TOKEN_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address

  beforeEach(async () => {
    await db.delete(tokenUsdPrice)
  })

  it("returns zeros when given empty array", async () => {
    const result = await recordPrices(db, CHAIN_ID, [])

    expect(result).toEqual({ inserted: 0, skipped: 0 })
  })

  it("inserts new price and returns correct counts", async () => {
    const prices: PriceResult[] = [
      {
        tokenAddress: TOKEN_A,
        usdPrice: 2500000000n, // $2500 in micro-dollars
        oracleUpdatedAt: new Date("2026-02-04T12:00:00Z"),
      },
    ]

    const result = await recordPrices(db, CHAIN_ID, prices)

    expect(result).toEqual({ inserted: 1, skipped: 0 })

    const stored = await db
      .select()
      .from(tokenUsdPrice)
      .where(and(eq(tokenUsdPrice.chainId, CHAIN_ID), eq(tokenUsdPrice.tokenAddress, TOKEN_A)))

    expect(stored).toHaveLength(1)
    expect(stored[0]?.usdPrice).toBe(2500000000n)
    expect(stored[0]?.oracleUpdatedAt).toEqual(new Date("2026-02-04T12:00:00Z"))
  })

  it("skips duplicate and returns correct counts", async () => {
    const oracleUpdatedAt = new Date("2026-02-04T12:00:00Z")

    await recordPrices(db, CHAIN_ID, [
      { tokenAddress: TOKEN_A, usdPrice: 2500000000n, oracleUpdatedAt },
    ])

    // Try to insert same price again
    const result = await recordPrices(db, CHAIN_ID, [
      { tokenAddress: TOKEN_A, usdPrice: 2600000000n, oracleUpdatedAt }, // Different price value, same PK
    ])

    expect(result).toEqual({ inserted: 0, skipped: 1 })

    // Verify original value is unchanged
    const stored = await db
      .select()
      .from(tokenUsdPrice)
      .where(and(eq(tokenUsdPrice.chainId, CHAIN_ID), eq(tokenUsdPrice.tokenAddress, TOKEN_A)))

    expect(stored).toHaveLength(1)
    expect(stored[0]?.usdPrice).toBe(2500000000n)
  })

  it("inserts new price when oracleUpdatedAt differs (oracle updated)", async () => {
    const oracleUpdatedAt1 = new Date("2026-02-04T12:00:00Z")
    const oracleUpdatedAt2 = new Date("2026-02-04T12:15:00Z")

    await recordPrices(db, CHAIN_ID, [
      { tokenAddress: TOKEN_A, usdPrice: 2500000000n, oracleUpdatedAt: oracleUpdatedAt1 },
    ])

    // Second insert with different oracleUpdatedAt - should succeed
    const result = await recordPrices(db, CHAIN_ID, [
      { tokenAddress: TOKEN_A, usdPrice: 2510000000n, oracleUpdatedAt: oracleUpdatedAt2 },
    ])

    expect(result).toEqual({ inserted: 1, skipped: 0 })

    const stored = await db
      .select()
      .from(tokenUsdPrice)
      .where(and(eq(tokenUsdPrice.chainId, CHAIN_ID), eq(tokenUsdPrice.tokenAddress, TOKEN_A)))

    expect(stored).toHaveLength(2)
  })

  it("correctly handles batch with mixed new/duplicate prices", async () => {
    const oracleUpdatedAt = new Date("2026-02-04T12:00:00Z")

    await recordPrices(db, CHAIN_ID, [
      { tokenAddress: TOKEN_A, usdPrice: 2500000000n, oracleUpdatedAt },
    ])

    // Batch insert: TOKEN_A (duplicate) + TOKEN_B (new)
    const result = await recordPrices(db, CHAIN_ID, [
      { tokenAddress: TOKEN_A, usdPrice: 2500000000n, oracleUpdatedAt },
      { tokenAddress: TOKEN_B, usdPrice: 45000000000n, oracleUpdatedAt },
    ])

    expect(result).toEqual({ inserted: 1, skipped: 1 })

    const stored = await db.select().from(tokenUsdPrice)
    expect(stored).toHaveLength(2)

    const tokenB = stored.find((r) => r.tokenAddress === TOKEN_B)
    expect(tokenB?.usdPrice).toBe(45000000000n)
  })

  it("sets createdAt timestamp automatically", async () => {
    const oracleUpdatedAt = new Date("2026-02-04T10:00:00Z")

    await recordPrices(db, CHAIN_ID, [
      { tokenAddress: TOKEN_A, usdPrice: 2500000000n, oracleUpdatedAt },
    ])

    const stored = await db
      .select()
      .from(tokenUsdPrice)
      .where(and(eq(tokenUsdPrice.chainId, CHAIN_ID), eq(tokenUsdPrice.tokenAddress, TOKEN_A)))

    expect(stored).toHaveLength(1)
    expect(stored[0]?.createdAt).toBeInstanceOf(Date)
    expect(stored[0]?.oracleUpdatedAt).toEqual(oracleUpdatedAt)
    expect(stored[0]!.createdAt.getTime()).toBeGreaterThan(oracleUpdatedAt.getTime())
  })

  it("stores correct chainId from parameter", async () => {
    const differentChainId = 43113

    await recordPrices(db, differentChainId, [
      {
        tokenAddress: TOKEN_A,
        usdPrice: 2500000000n,
        oracleUpdatedAt: new Date("2026-02-04T12:00:00Z"),
      },
    ])

    const stored = await db
      .select()
      .from(tokenUsdPrice)
      .where(eq(tokenUsdPrice.chainId, differentChainId))

    expect(stored).toHaveLength(1)
    expect(stored[0]?.chainId).toBe(differentChainId)
  })
})

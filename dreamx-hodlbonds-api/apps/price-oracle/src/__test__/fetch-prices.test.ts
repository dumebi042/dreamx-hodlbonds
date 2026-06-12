import type { Address } from "viem"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { OracleEntry } from "../config"

import { fetchPrices } from "../fetch-prices"

const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

function createMockClient(results: readonly [bigint, bigint, bigint, bigint, bigint][]) {
  return {
    chain: { id: 43114 },
    multicall: vi.fn().mockResolvedValue(results),
  } as unknown as Parameters<typeof fetchPrices>[0]
}

describe("fetchPrices", () => {
  beforeEach(() => {
    warnSpy.mockClear()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-02-04T12:00:00Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const TOKEN_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address
  const TOKEN_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address
  const ORACLE_A = "0x1111111111111111111111111111111111111111" as Address
  const ORACLE_B = "0x2222222222222222222222222222222222222222" as Address

  it("returns empty array when no oracles configured", async () => {
    const client = createMockClient([])
    const result = await fetchPrices(client, {})

    expect(result).toEqual([])
    expect(client.multicall).not.toHaveBeenCalled()
  })

  it("converts 8-decimal Chainlink price to 6-decimal micro-dollars", async () => {
    // Chainlink returns 8 decimals: $2500.00 = 250000000000 (2500 * 10^8)
    const chainlinkPrice = 250000000000n // $2500.00 in 8 decimals
    const updatedAt = BigInt(Math.floor(Date.now() / 1000)) // current time (not stale)

    const client = createMockClient([
      [1n, chainlinkPrice, 0n, updatedAt, 1n], // roundId, answer, startedAt, updatedAt, answeredInRound
    ])

    const oracles: Record<string, OracleEntry> = {
      ETH_USD: { tokenAddress: TOKEN_A, oracleAddress: ORACLE_A },
    }

    const result = await fetchPrices(client, oracles)

    expect(result).toHaveLength(1)
    // 250000000000 / 100 = 2500000000 (2500 * 10^6 = $2500 in micro-dollars)
    expect(result[0]?.usdPrice).toBe(2500000000n)
  })

  it("fetches multiple prices in single multicall", async () => {
    const now = BigInt(Math.floor(Date.now() / 1000))

    const client = createMockClient([
      [1n, 250000000000n, 0n, now, 1n], // ETH: $2500
      [1n, 4500000000000n, 0n, now, 1n], // BTC: $45000
    ])

    const oracles: Record<string, OracleEntry> = {
      ETH_USD: { tokenAddress: TOKEN_A, oracleAddress: ORACLE_A },
      BTC_USD: { tokenAddress: TOKEN_B, oracleAddress: ORACLE_B },
    }

    const result = await fetchPrices(client, oracles)

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({
      tokenAddress: TOKEN_A,
      usdPrice: 2500000000n, // $2500 in micro-dollars
    })
    expect(result[1]).toMatchObject({
      tokenAddress: TOKEN_B,
      usdPrice: 45000000000n, // $45000 in micro-dollars
    })

    expect(client.multicall).toHaveBeenCalledTimes(1)
  })

  it("correctly maps oracleUpdatedAt from oracle updatedAt timestamp", async () => {
    const updatedAt = BigInt(Math.floor(new Date("2026-02-04T10:30:00Z").getTime() / 1000))

    const client = createMockClient([
      [1n, 100000000n, 0n, updatedAt, 1n], // $1.00
    ])

    const oracles: Record<string, OracleEntry> = {
      USDC_USD: { tokenAddress: TOKEN_A, oracleAddress: ORACLE_A },
    }

    const result = await fetchPrices(client, oracles)

    expect(result[0]?.oracleUpdatedAt).toEqual(new Date("2026-02-04T10:30:00Z"))
  })

  it("warns when oracle data is stale (>24h old)", async () => {
    const twentyFiveHoursAgo = BigInt(Math.floor(Date.now() / 1000)) - BigInt(25 * 60 * 60)

    const client = createMockClient([[1n, 100000000n, 0n, twentyFiveHoursAgo, 1n]])

    const oracles: Record<string, OracleEntry> = {
      STALE_TOKEN: { tokenAddress: TOKEN_A, oracleAddress: ORACLE_A },
    }

    await fetchPrices(client, oracles)

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("STALE_TOKEN oracle data is 25h old"),
    )
  })

  it("does not warn when oracle data is fresh (<24h old)", async () => {
    const oneHourAgo = BigInt(Math.floor(Date.now() / 1000)) - BigInt(60 * 60)

    const client = createMockClient([[1n, 100000000n, 0n, oneHourAgo, 1n]])

    const oracles: Record<string, OracleEntry> = {
      FRESH_TOKEN: { tokenAddress: TOKEN_A, oracleAddress: ORACLE_A },
    }

    await fetchPrices(client, oracles)

    expect(warnSpy).not.toHaveBeenCalled()
  })
})

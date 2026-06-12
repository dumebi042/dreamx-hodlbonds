import type { Schema } from "@hodlbonds-api/db/schema"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"

import { tokenUsdPrice } from "@hodlbonds-api/db/schema"

import type { PriceResult } from "./fetch-prices"

export type RecordPricesResult = {
  inserted: number
  skipped: number
}

/**
 * Records price data to the database using upsert semantics.
 *
 * @param db - Drizzle database instance
 * @param chainId - Chain ID for all prices
 * @param prices - Array of price results from fetchPrices
 * @returns Count of inserted vs skipped prices
 */
export async function recordPrices(
  db: NodePgDatabase<Schema>,
  chainId: number,
  prices: PriceResult[],
): Promise<RecordPricesResult> {
  if (prices.length === 0) {
    return { inserted: 0, skipped: 0 }
  }

  const result = await db
    .insert(tokenUsdPrice)
    .values(
      prices.map((p) => ({
        chainId,
        tokenAddress: p.tokenAddress,
        usdPrice: p.usdPrice,
        oracleUpdatedAt: p.oracleUpdatedAt,
      })),
    )
    // Skip duplicate entries based on chainId + tokenAddress + oracleUpdatedAt
    .onConflictDoNothing()
    .returning({ tokenAddress: tokenUsdPrice.tokenAddress })

  const inserted = result.length
  const skipped = prices.length - inserted

  return { inserted, skipped }
}

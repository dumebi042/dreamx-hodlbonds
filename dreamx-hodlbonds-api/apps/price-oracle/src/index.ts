// oxlint-disable no-await-in-loop
import type { ChainId } from "@hodlbonds-api/blockchain"

import { clients } from "@hodlbonds-api/blockchain"
import { getDb, initDb } from "@hodlbonds-api/db"
import { env } from "@hodlbonds-api/env/price-oracle"
import { formatUnits } from "viem"

import { ORACLE_CONFIG } from "./config"
import { fetchPrices } from "./fetch-prices"
import { recordPrices } from "./record-prices"

const MAX_RETRIES = 3
const RETRY_DELAY_MS = 1000

/** Delay helper that returns a promise resolving after ms milliseconds */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/**
 * Simple retry wrapper with exponential backoff.
 */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: Error = new Error("Retry failed")

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt < MAX_RETRIES) {
        const delayMs = RETRY_DELAY_MS * 2 ** attempt
        console.warn(`Attempt ${attempt + 1} failed, retrying in ${delayMs}ms...`)
        await delay(delayMs)
      }
    }
  }

  throw lastError
}

async function main() {
  const chainId = env.CHAIN_ID as ChainId

  const config = ORACLE_CONFIG[chainId]
  if (!config) {
    throw new Error(`No oracle config for chainId=${chainId}`)
  }

  const oracleCount = Object.keys(config).length
  if (oracleCount === 0) {
    console.log(`No oracles configured for chain ${chainId}, exiting.`)
    return
  }

  await initDb()
  const db = getDb()

  const client = clients[chainId]
  console.log(`Fetching ${oracleCount} price(s) for chain ${chainId}...`)

  const prices = await withRetry(() => fetchPrices(client, config))
  console.log(`Received ${prices.length} price(s), inserting...`)

  const { inserted, skipped } = await recordPrices(db, chainId, prices)
  console.log(`✓ Inserted ${inserted} new price(s), skipped ${skipped} unchanged.`)

  for (const price of prices) {
    const symbol = Object.entries(config).find(
      ([, o]) => o.tokenAddress === price.tokenAddress,
    )?.[0]
    const dollars = formatUnits(price.usdPrice, 6)
    console.log(`  ${symbol}: $${dollars} (oracle updated ${price.oracleUpdatedAt.toISOString()})`)
  }
}

try {
  await main()
  console.log("Price oracle job complete.")
  process.exit(0)
} catch (err) {
  console.error("Fatal error:", err)
  process.exit(1)
}

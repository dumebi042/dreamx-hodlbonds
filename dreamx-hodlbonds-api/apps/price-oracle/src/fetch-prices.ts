import type { ChainId, Client } from "@hodlbonds-api/blockchain"
import type { Address } from "viem"

import { contractMap } from "@hodlbonds-api/blockchain"

import type { OracleEntry } from "./config"

const STALENESS_WARNING_SECONDS = 86400

export type PriceResult = {
  tokenAddress: Address
  usdPrice: bigint
  oracleUpdatedAt: Date
}

/**
 * Fetches prices for all configured oracles on a chain using a single multicall.
 *
 * @param client - Viem public client for the chain
 * @param oracles - Map of symbol -> oracle config entries
 * @returns Array of price results for each token
 */
export async function fetchPrices(
  client: Client,
  oracles: Record<string, OracleEntry>,
): Promise<PriceResult[]> {
  const entries = Object.entries(oracles)

  if (entries.length === 0) {
    return []
  }

  const contracts = entries.map(([, oracle]) => ({
    ...contractMap.chainlinkPriceFeed.contract(client.chain!.id as ChainId, oracle.oracleAddress),
    functionName: "latestRoundData" as const,
  }))

  const results = await client.multicall({
    contracts,
    allowFailure: false,
  })

  const now = Math.floor(Date.now() / 1000)

  return results.map((roundData, index) => {
    const [symbol, oracle] = entries[index]!
    const [, answer, , updatedAt] = roundData

    const stalenessSeconds = now - Number(updatedAt)
    if (stalenessSeconds > STALENESS_WARNING_SECONDS) {
      const stalenessHours = Math.floor(stalenessSeconds / 3600)
      console.warn(
        `⚠️  ${symbol} oracle data is ${stalenessHours}h old (updated ${new Date(Number(updatedAt) * 1000).toISOString()})`,
      )
    }

    // Chainlink USD feeds return 8 decimals, we store 6 decimals (micro-dollars)
    // Divide by 100 to convert: 8 decimals → 6 decimals
    const usdPrice = answer / 100n

    return {
      tokenAddress: oracle.tokenAddress,
      usdPrice,
      oracleUpdatedAt: new Date(Number(updatedAt) * 1000),
    }
  })
}

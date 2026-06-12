import type { DexDetails, DexName, VaultState } from "@/types"

import { dexIdToName, DEX_URLS, contractStateToString } from "@/types"

// 5 day buffer before tradingEndsAt when we switch to HARVESTING
const HARVESTING_BUFFER_SECONDS = 86400 * 5

/**
 * Convert contract vault state to display vault state.
 * The contract has 3 states, but we display 5 to give users more context.
 *
 * - BOND_ISSUANCE: Initial bond sale period
 * - TRADING: Active trading period (more than 5 days before end)
 * - HARVESTING: Final 5 days of trading period (preparing to settle)
 * - CLAIM: Trading period ended, waiting for settlement
 * - SETTLED: Bond has been settled
 */
export function getBondState(
  contractState: number,
  tradingEndsAt: number, // unix timestamp in seconds
): VaultState {
  const state = contractStateToString(contractState)

  switch (state) {
    case "BOND_ISSUANCE":
      return "BOND_ISSUANCE"
    case "TRADING": {
      const currentTime = Math.floor(Date.now() / 1000)
      const harvestingTime = tradingEndsAt - HARVESTING_BUFFER_SECONDS

      if (currentTime < harvestingTime) {
        return "TRADING"
      } else if (currentTime < tradingEndsAt) {
        return "HARVESTING"
      }
      return "CLAIM"
    }
    case "SETTLED":
      return "SETTLED"
  }
}

/**
 * Build dex details object.
 */
function buildDexDetails(name: DexName, pairAddress: string | null): DexDetails {
  return {
    name,
    url: DEX_URLS[name],
    pairAddress,
  }
}

/**
 * Get primary and secondary dex info based on the primary dex id.
 * LFJ uses tokenPairAddress, Blackhole uses pairAddress from the pairs table.
 */
export function getDexInfo(
  primaryDexId: number,
  lfjPairAddress: string | null,
  blackholePairAddress: string | null,
): { primaryDex: DexDetails; secondaryDex: DexDetails } {
  const primaryDexName = dexIdToName(primaryDexId)

  switch (primaryDexName) {
    case "LFJ":
      return {
        primaryDex: buildDexDetails("LFJ", lfjPairAddress),
        secondaryDex: buildDexDetails("Blackhole", blackholePairAddress),
      }
    case "Blackhole":
      return {
        primaryDex: buildDexDetails("Blackhole", blackholePairAddress),
        secondaryDex: buildDexDetails("LFJ", lfjPairAddress),
      }
  }
}

/**
 * Determine which DEX was used for a trade based on the router address.
 * Compares against known router addresses from the pair configuration.
 */
export function getTradeDex(
  routerAddress: string,
  pair: { routerAddress: string | null; routerV2Address: string | null } | null,
): DexName | "Unknown" {
  if (!pair) return "Unknown"

  if (pair.routerAddress && routerAddress === pair.routerAddress) {
    return "LFJ"
  }
  if (pair.routerV2Address && routerAddress === pair.routerV2Address) {
    return "Blackhole"
  }
  return "Unknown"
}

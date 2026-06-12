import type { ChainId } from "@hodlbonds-api/blockchain"
import type { Address } from "viem"

import { clients } from "@hodlbonds-api/blockchain"
import { contractMap } from "@hodlbonds-api/blockchain"

import { withBlockchainError } from "@/lib/blockchain-error-handler"
import { errors } from "@/lib/errors"

import {
  calculateDeviationBps,
  MAX_ORACLE_DEVIATION_BPS,
  MAX_ORACLE_STALENESS_SECONDS,
} from "./utils"

export interface OracleValidationParams {
  chainId: ChainId
  oracleAddress: Address
  /** Amount of vault token being swapped (input for sell, output for buy) */
  vaultTokenAmount: bigint
  /** Amount of stable token (output for sell, input for buy) */
  stableTokenAmount: bigint
  /** Vault token decimals */
  vaultTokenDecimals: number
  /** Stable token decimals */
  stableTokenDecimals: number
}

/**
 * Validates a DEX quote against the Chainlink oracle price feed.
 *
 * The oracle returns the vault token price in USD with 8 decimal precision.
 * We calculate the "fair" stable token amount based on the oracle price
 * and compare it to the DEX quote's stable token amount.
 *
 * Rejects quotes that deviate more than MAX_ORACLE_DEVIATION_BPS from the oracle price.
 *
 * @throws Error if oracle price is stale or quote deviates more than MAX_ORACLE_DEVIATION_BPS
 */
export async function validateQuoteAgainstOracle(params: OracleValidationParams): Promise<void> {
  const {
    chainId,
    oracleAddress,
    vaultTokenAmount,
    stableTokenAmount,
    vaultTokenDecimals,
    stableTokenDecimals,
  } = params

  const client = clients[chainId]
  const oracleContract = contractMap.chainlinkPriceFeed.contract(chainId, oracleAddress)

  // Fetch oracle data: price and decimals
  const [roundData, oracleDecimals] = await withBlockchainError(
    async () =>
      await client.multicall({
        contracts: [
          { ...oracleContract, functionName: "latestRoundData" },
          { ...oracleContract, functionName: "decimals" },
        ],
        allowFailure: false,
      }),
    { chainId, oracleAddress },
  )

  const [, answer, , updatedAt] = roundData
  const oraclePrice = answer // vault token price in USD

  // Check staleness
  const now = Math.floor(Date.now() / 1000)
  const staleness = now - Number(updatedAt)
  if (staleness > MAX_ORACLE_STALENESS_SECONDS) {
    throw errors.internal(
      `Oracle price is stale (${staleness}s old, max ${MAX_ORACLE_STALENESS_SECONDS}s)`,
    )
  }

  // Calculate the "fair" stable token amount based on oracle price
  // oraclePrice is vaultToken/USD with oracleDecimals precision
  // fairStableAmount = vaultTokenAmount * oraclePrice / 10^oracleDecimals
  // Then normalize for token decimals
  // fairStableAmount = vaultTokenAmount * oraclePrice * 10^stableDecimals / (10^oracleDecimals * 10^vaultTokenDecimals)

  const oracleScaleFactor = 10n ** BigInt(oracleDecimals)
  const vaultTokenScaleFactor = 10n ** BigInt(vaultTokenDecimals)
  const stableTokenScaleFactor = 10n ** BigInt(stableTokenDecimals)

  const fairStableAmount =
    (vaultTokenAmount * oraclePrice * stableTokenScaleFactor) /
    (oracleScaleFactor * vaultTokenScaleFactor)

  // Calculate deviation: how much the quote differs from fair price
  const deviationBps = calculateDeviationBps(stableTokenAmount, fairStableAmount)
  const absDeviation = deviationBps < 0n ? -deviationBps : deviationBps
  console.log(`Quote deviation from oracle: ${Number(deviationBps) / 100} bps`)

  if (!client.chain.testnet && absDeviation > MAX_ORACLE_DEVIATION_BPS) {
    const deviationPercent = Number(deviationBps) / 100
    throw errors.badRequest(
      `Quote deviates ${deviationPercent.toFixed(2)}% from oracle price (max ${Number(MAX_ORACLE_DEVIATION_BPS) / 100}%)`,
    )
  }
}

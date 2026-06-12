import { getDb } from "@hodlbonds-api/db"
import { bonds } from "@hodlbonds-api/db/schema/index"
import { getAddress } from "viem"

import type { DecodedLog, BondIssuedEvent } from "../types/events"

/**
 * Handles BondIssued events by upserting bond state data
 */
export async function handleBondIssued(event: DecodedLog<BondIssuedEvent>): Promise<void> {
  const { args, chainId, transactionHash, blockNumber, blockTimestamp: blockTs, address } = event
  const {
    creator,
    vaultToken,
    stableToken,
    vaultTokenAmount,
    stableTokenAmount,
    managementFeeAmount,
  } = args

  if (blockNumber === null || blockTs === undefined) {
    throw new Error(
      `Missing required event metadata for BondIssued event ${transactionHash}: ` +
        `blockNumber=${blockNumber}, blockTimestamp=${blockTs}`,
    )
  }

  const blockTimestamp = Number(blockTs)
  const blockTimestampDate = new Date(blockTimestamp * 1000)

  const db = getDb()
  await db
    .insert(bonds)
    .values({
      // Ingestion details
      chainId,
      txHash: transactionHash,
      blockNumber: Number(blockNumber),
      blockTimestamp: blockTimestampDate,

      // Bond identifiers
      issuer: getAddress(creator),
      vaultAddress: getAddress(address),
      vaultTokenAddress: getAddress(vaultToken),
      stableTokenAddress: getAddress(stableToken),

      // Vault state from BondIssued event
      vaultState: 1,
      startingStableTokenBalance: stableTokenAmount,
      startingVaultTokenBalance: vaultTokenAmount,
      stableTokenBalance: stableTokenAmount,
      vaultTokenBalance: vaultTokenAmount,
      balanceBlockNumber: Number(blockNumber),
      balanceBlockTimestamp: blockTimestampDate,
      managementFeePaid: managementFeeAmount,
    })
    .onConflictDoUpdate({
      target: [bonds.chainId, bonds.vaultAddress],
      set: {
        // Update vault state fields
        vaultState: 1,
        startingStableTokenBalance: stableTokenAmount,
        startingVaultTokenBalance: vaultTokenAmount,
        stableTokenBalance: stableTokenAmount,
        vaultTokenBalance: vaultTokenAmount,
        balanceBlockNumber: Number(blockNumber),
        balanceBlockTimestamp: blockTimestampDate,
        managementFeePaid: managementFeeAmount,
      },
    })
}

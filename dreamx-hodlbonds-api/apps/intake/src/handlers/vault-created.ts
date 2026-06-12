import { getDb } from "@hodlbonds-api/db"
import { bonds } from "@hodlbonds-api/db/schema/index"
import { getAddress } from "viem"

import type { DecodedLog, VaultCreatedEvent } from "../types/events"

/**
 * Handles VaultCreated events by upserting bond data
 */
export async function handleVaultCreated(event: DecodedLog<VaultCreatedEvent>): Promise<void> {
  const { args, chainId, transactionHash, blockNumber, blockTimestamp: blockTs, address } = event
  const { creator, vaultId, vaultAddress, pairId, approvedPair, vaultParameters } = args

  if (blockNumber === null || blockTs === undefined) {
    throw new Error(
      `Missing required event metadata for VaultCreated event ${transactionHash}: ` +
        `blockNumber=${blockNumber}, blockTimestamp=${blockTs}`,
    )
  }

  const blockTimestamp = Number(blockTs)
  const blockTimestampDate = new Date(blockTimestamp * 1000)
  const tradingEndsAt = new Date((blockTimestamp + vaultParameters.tradingPeriodDuration) * 1000)

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
      vaultAddress: getAddress(vaultAddress),
      vaultTokenAddress: getAddress(approvedPair.vaultTokenAddress),
      stableTokenAddress: getAddress(approvedPair.stableTokenAddress),

      // Factory event data
      factoryAddress: getAddress(address),
      receiptTokenAddress: getAddress(vaultParameters.receiptTokenAddress),
      managementFee: vaultParameters.managementFee,
      performanceFee: vaultParameters.performanceFee,
      vaultId: Number(vaultId),
      bondPrice: vaultParameters.bondPrice,
      reserveRatio: vaultParameters.reserveRatio,
      tradingPeriodDuration: vaultParameters.tradingPeriodDuration,
      tradingEndsAt,
      primaryDex: vaultParameters.primaryDex,
      pairId: Number(pairId),
    })
    .onConflictDoUpdate({
      target: [bonds.chainId, bonds.vaultAddress],
      set: {
        // Update factory-related fields if they were null
        factoryAddress: getAddress(address),
        receiptTokenAddress: getAddress(vaultParameters.receiptTokenAddress),
        managementFee: vaultParameters.managementFee,
        performanceFee: vaultParameters.performanceFee,
        vaultId: Number(vaultId),
        bondPrice: vaultParameters.bondPrice,
        reserveRatio: vaultParameters.reserveRatio,
        tradingPeriodDuration: vaultParameters.tradingPeriodDuration,
        tradingEndsAt,
        primaryDex: vaultParameters.primaryDex,
        pairId: Number(pairId),
      },
    })
}

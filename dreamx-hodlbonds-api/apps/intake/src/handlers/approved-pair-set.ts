import { getDb } from "@hodlbonds-api/db"
import { pairs } from "@hodlbonds-api/db/schema/index"
import { getAddress } from "viem"

import type { ApprovedPairSetEvent, DecodedLog } from "../types/events"

/**
 * Handles ApprovedPairSet events by upserting pair data
 */
export async function handleApprovedPairSet(
  event: DecodedLog<ApprovedPairSetEvent>,
): Promise<void> {
  const { args, chainId, address } = event
  const { pairId, approvedPair } = args

  const db = getDb()
  await db
    .insert(pairs)
    .values({
      id: Number(pairId),
      chainId,
      factoryAddress: getAddress(address),
      stableTokenAddress: getAddress(approvedPair.stableTokenAddress),
      vaultTokenAddress: getAddress(approvedPair.vaultTokenAddress),
      wrappedNativeTokenAddress: getAddress(approvedPair.wrappedNativeTokenAddress),
      routerAddress: getAddress(approvedPair.routerAddress),
      tokenPairAddress: getAddress(approvedPair.tokenPairAddress),
      version: approvedPair.version,
      routerV2Address: getAddress(approvedPair.routerV2Address),
      pairAddress: getAddress(approvedPair.pairAddress),
      concentrated: approvedPair.concentrated,
      chainlinkPriceOracleAddress: getAddress(approvedPair.chainlinkPriceOracleAddress),
    })
    .onConflictDoUpdate({
      target: [pairs.id, pairs.chainId, pairs.factoryAddress],
      set: {
        stableTokenAddress: getAddress(approvedPair.stableTokenAddress),
        vaultTokenAddress: getAddress(approvedPair.vaultTokenAddress),
        wrappedNativeTokenAddress: getAddress(approvedPair.wrappedNativeTokenAddress),
        routerAddress: getAddress(approvedPair.routerAddress),
        tokenPairAddress: getAddress(approvedPair.tokenPairAddress),
        version: approvedPair.version,
        routerV2Address: getAddress(approvedPair.routerV2Address),
        pairAddress: getAddress(approvedPair.pairAddress),
        concentrated: approvedPair.concentrated,
        chainlinkPriceOracleAddress: getAddress(approvedPair.chainlinkPriceOracleAddress),
      },
    })
}

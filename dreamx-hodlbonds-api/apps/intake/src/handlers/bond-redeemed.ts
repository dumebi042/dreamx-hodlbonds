import { getDb } from "@hodlbonds-api/db"
import { bonds } from "@hodlbonds-api/db/schema/index"
import { and, eq } from "drizzle-orm"
import { getAddress } from "viem"

import type { BondRedeemedEvent, DecodedLog } from "../types/events"

/**
 * Handles BondRedeemed events by updating bond state to settled
 */
export async function handleBondRedeemed(event: DecodedLog<BondRedeemedEvent>): Promise<void> {
  const { args, chainId, transactionHash, blockNumber, blockTimestamp: blockTs, address } = event
  const { redeemer, vaultTokenAmount, stableTokenAmount, performanceFeeAmount } = args

  if (blockNumber === null || blockTs === undefined) {
    throw new Error(
      `Missing required event metadata for BondRedeemed event ${transactionHash}: ` +
        `blockNumber=${blockNumber}, blockTimestamp=${blockTs}`,
    )
  }

  const blockTimestamp = Number(blockTs)
  const blockTimestampDate = new Date(blockTimestamp * 1000)
  const vaultAddress = getAddress(address)

  const db = getDb()

  const result = await db
    .update(bonds)
    .set({
      // Update vault state to SETTLED
      vaultState: 2,

      // Current balances are now zero (vault is empty after redemption)
      stableTokenBalance: 0n,
      vaultTokenBalance: 0n,
      balanceBlockNumber: Number(blockNumber),
      balanceBlockTimestamp: blockTimestampDate,

      // Record final balances that were distributed
      finalStableTokenBalance: stableTokenAmount,
      finalVaultTokenBalance: vaultTokenAmount,

      // Record settlement details
      settledBlockNumber: Number(blockNumber),
      settledBlockTimestamp: blockTimestampDate,
      settledBy: getAddress(redeemer),
      performanceFeePaid: performanceFeeAmount,
    })
    .where(and(eq(bonds.chainId, chainId), eq(bonds.vaultAddress, vaultAddress)))
    .returning({ id: bonds.id })

  if (result.length === 0) {
    throw new Error(`Bond not found for vault ${vaultAddress} on chain ${chainId}`)
  }
}

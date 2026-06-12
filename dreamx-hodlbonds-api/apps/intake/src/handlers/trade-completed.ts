import { getDb } from "@hodlbonds-api/db"
import { bonds, trades } from "@hodlbonds-api/db/schema/index"
import { and, eq } from "drizzle-orm"
import { getAddress, zeroAddress } from "viem"

import type { DecodedLog, TradeCompletedEvent } from "../types/events"

/**
 * Check if an address matches the vault token, accounting for native token (0x0) → wrapped native mapping
 */
function isVaultToken(
  address: string,
  vaultTokenAddress: string,
  wrappedNativeAddress: string | null,
): boolean {
  if (address === vaultTokenAddress) return true
  // If vault token is native (0x0), also check wrapped native address
  if (vaultTokenAddress === zeroAddress && wrappedNativeAddress) {
    return address === wrappedNativeAddress
  }
  return false
}

/**
 * Handles TradeCompleted events by inserting trade records and updating bond balances
 */
export async function handleTradeCompleted(event: DecodedLog<TradeCompletedEvent>): Promise<void> {
  const { args, chainId, transactionHash, blockNumber, blockTimestamp: blockTs, logIndex } = event
  const {
    vaultAddress,
    routerAddress,
    tokenIn: tokenInRaw,
    tokenOut: tokenOutRaw,
    amountIn,
    amountOut,
    tokenInBalanceAfterSwap,
    tokenOutBalanceAfterSwap,
  } = args

  if (blockNumber === null || blockTs === undefined || logIndex === null) {
    throw new Error(
      `Missing required event metadata for TradeCompleted event ${transactionHash}: ` +
        `blockNumber=${blockNumber}, blockTimestamp=${blockTs}, logIndex=${logIndex}`,
    )
  }

  const blockTimestamp = Number(blockTs)
  const blockTimestampDate = new Date(blockTimestamp * 1000)

  const tokenOut = getAddress(tokenOutRaw)
  const tokenIn = getAddress(tokenInRaw)
  const vaultAddr = getAddress(vaultAddress)

  const db = getDb()
  const bond = await db.query.bonds.findFirst({
    where: and(eq(bonds.chainId, chainId), eq(bonds.vaultAddress, vaultAddr)),
    with: {
      pair: true,
    },
  })

  if (!bond) {
    throw new Error(`Bond not found for vault ${vaultAddress} on chain ${chainId}`)
  }

  const stableTokenAddr = bond.stableTokenAddress
  const vaultTokenAddr = bond.vaultTokenAddress
  const wrappedNativeAddr = bond.pair?.wrappedNativeTokenAddress ?? null

  // Map tokenIn/tokenOut balances to stable/vault balances
  let newStableBalance: bigint
  let newVaultBalance: bigint

  if (tokenIn === stableTokenAddr && isVaultToken(tokenOut, vaultTokenAddr, wrappedNativeAddr)) {
    // Buying stable with vault: tokenIn=stable, tokenOut=vault
    newStableBalance = tokenInBalanceAfterSwap
    newVaultBalance = tokenOutBalanceAfterSwap
  } else if (
    isVaultToken(tokenIn, vaultTokenAddr, wrappedNativeAddr) &&
    tokenOut === stableTokenAddr
  ) {
    // Buying vault with stable: tokenIn=vault, tokenOut=stable
    newVaultBalance = tokenInBalanceAfterSwap
    newStableBalance = tokenOutBalanceAfterSwap
  } else {
    throw new Error(
      `Invalid token combination: tokenIn=${tokenIn}, tokenOut=${tokenOut}, stable=${stableTokenAddr}, vault=${vaultTokenAddr}${wrappedNativeAddr ? ` (or wrapped=${wrappedNativeAddr})` : ""}`,
    )
  }

  // Atomically insert trade and update bond balances
  await db.transaction(async (tx) => {
    // Insert trade record with post-swap balances
    await tx.insert(trades).values({
      chainId,
      txHash: transactionHash,
      logIndex,
      blockNumber: Number(blockNumber),
      blockTimestamp: blockTimestampDate,
      vaultAddress: vaultAddr,
      routerAddress: getAddress(routerAddress),
      tokenOut,
      tokenIn,
      amountOut,
      amountIn,
      tokenInBalance: tokenInBalanceAfterSwap,
      tokenOutBalance: tokenOutBalanceAfterSwap,
    })

    // Build update object with conditional fields
    const updateFields: Record<string, unknown> = {}

    // Only update balances if this event is newer than the last balance update
    if (!bond.balanceBlockNumber || bond.balanceBlockNumber < Number(blockNumber)) {
      updateFields.stableTokenBalance = newStableBalance
      updateFields.vaultTokenBalance = newVaultBalance
      updateFields.balanceBlockNumber = Number(blockNumber)
      updateFields.balanceBlockTimestamp = blockTimestampDate
    }

    // Only update lastSwap metadata if this trade is newer than the last swap
    if (!bond.lastSwapBlockNumber || bond.lastSwapBlockNumber < Number(blockNumber)) {
      updateFields.lastSwapBlockNumber = Number(blockNumber)
      updateFields.lastSwapBlockTimestamp = blockTimestampDate
    }

    // Only update bond if there are fields to update
    if (Object.keys(updateFields).length > 0) {
      await tx
        .update(bonds)
        .set(updateFields)
        .where(and(eq(bonds.chainId, chainId), eq(bonds.vaultAddress, vaultAddr)))
    }
  })
}

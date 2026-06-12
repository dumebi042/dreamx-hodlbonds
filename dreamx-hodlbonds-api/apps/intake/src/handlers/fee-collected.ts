import { getDb } from "@hodlbonds-api/db"
import { feesCollected, tokenUsdPrice } from "@hodlbonds-api/db/schema/index"
import { and, desc, eq, lte } from "drizzle-orm"
import { getAddress } from "viem"

import type { DecodedLog, FeeCollectedEvent } from "../types/events"

/**
 * Handles FeeCollected events by inserting fee collection records
 */
export async function handleFeeCollected(event: DecodedLog<FeeCollectedEvent>): Promise<void> {
  const {
    args,
    chainId,
    transactionHash,
    blockNumber,
    blockTimestamp: blockTs,
    logIndex,
    address,
  } = event
  const { to, token, amount } = args

  if (blockNumber === null || blockTs === undefined || logIndex === null) {
    throw new Error(
      `Missing required event metadata for FeeCollected event ${transactionHash}: ` +
        `blockNumber=${blockNumber}, blockTimestamp=${blockTs}, logIndex=${logIndex}`,
    )
  }

  const blockTimestamp = Number(blockTs)
  const blockTimestampDate = new Date(blockTimestamp * 1000)
  const tokenAddress = getAddress(token)

  const db = getDb()

  // Look up the most recent USD price at or before the block timestamp
  const priceRecord = await db.query.tokenUsdPrice.findFirst({
    where: and(
      eq(tokenUsdPrice.chainId, chainId),
      eq(tokenUsdPrice.tokenAddress, tokenAddress),
      lte(tokenUsdPrice.oracleUpdatedAt, blockTimestampDate),
    ),
    orderBy: desc(tokenUsdPrice.oracleUpdatedAt),
    columns: { usdPrice: true },
    with: { token: { columns: { decimals: true } } },
  })

  if (!priceRecord) {
    console.warn(
      `No price data for token: chainId=${chainId}, address=${tokenAddress}, before=${blockTimestampDate.toISOString()}`,
    )
  } else if (!priceRecord.token) {
    console.warn(`Token not found: chainId=${chainId}, address=${tokenAddress}`)
  }

  // usdPrice is micro-dollars per whole token (6 decimals)
  // amount is in token's native decimals
  // usdValue = (amount * usdPrice) / 10^tokenDecimals
  const usdValue = priceRecord?.token
    ? (amount * priceRecord.usdPrice) / 10n ** BigInt(priceRecord.token.decimals)
    : null

  await db
    .insert(feesCollected)
    .values({
      chainId,
      txHash: transactionHash,
      logIndex,
      blockNumber: Number(blockNumber),
      blockTimestamp: blockTimestampDate,
      vaultAddress: getAddress(address),
      recipientAddress: getAddress(to),
      tokenAddress,
      amount,
      usdValue,
    })
    .onConflictDoNothing()
}

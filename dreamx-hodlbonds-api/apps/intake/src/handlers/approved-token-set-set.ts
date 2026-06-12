import { getDb } from "@hodlbonds-api/db"
import { marketplaceTokenSets } from "@hodlbonds-api/db/schema/index"
import { getAddress } from "viem"

import type { ApprovedTokenSetSetEvent, DecodedLog } from "../types/events"

/**
 * Handles ApprovedTokenSetSet events by inserting marketplace token set data
 */
export async function handleApprovedTokenSetSet(
  event: DecodedLog<ApprovedTokenSetSetEvent>,
): Promise<void> {
  const { args, chainId, address } = event
  const { tokenSetId, erc1155Address, tradeTokenAddress } = args

  const db = getDb()
  await db
    .insert(marketplaceTokenSets)
    .values({
      chainId,
      marketplaceAddress: getAddress(address),
      tokenSetId: Number(tokenSetId),
      receiptTokenAddress: getAddress(erc1155Address),
      priceTokenAddress: getAddress(tradeTokenAddress),
    })
    .onConflictDoUpdate({
      target: [
        marketplaceTokenSets.chainId,
        marketplaceTokenSets.marketplaceAddress,
        marketplaceTokenSets.tokenSetId,
      ],
      set: {
        receiptTokenAddress: getAddress(erc1155Address),
        priceTokenAddress: getAddress(tradeTokenAddress),
      },
    })
}

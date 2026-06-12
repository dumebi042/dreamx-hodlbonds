import { getDb } from "@hodlbonds-api/db"
import { getAddress } from "viem"

import type { DecodedLog, TransferBatchEvent } from "../types/events"

import { processTransfer } from "./transfer-single"

// =============================================================================
// TransferBatch Handler
// =============================================================================

/**
 * Handles TransferBatch ERC1155 events.
 * A batch transfer has the same from/to for all transfers, but different tokenIds and values.
 *
 * Delegates to processTransfer for each (tokenId, value) pair in the batch.
 * All transfers are processed within a single database transaction.
 */
export async function handleTransferBatch(event: DecodedLog<TransferBatchEvent>): Promise<void> {
  const {
    args,
    chainId,
    transactionHash,
    blockNumber,
    blockTimestamp: blockTs,
    logIndex,
    address,
  } = event
  const { from: fromRaw, to: toRaw, ids, values } = args

  if (blockNumber === null || blockTs === undefined || logIndex === null) {
    throw new Error(
      `Missing required event metadata for TransferBatch event ${transactionHash}: ` +
        `blockNumber=${blockNumber}, blockTimestamp=${blockTs}, logIndex=${logIndex}`,
    )
  }

  if (ids.length !== values.length) {
    throw new Error(
      `TransferBatch ids/values length mismatch: ${ids.length} ids vs ${values.length} values in ${transactionHash}`,
    )
  }

  // Empty batch - no-op
  if (ids.length === 0) {
    return
  }

  const blockTimestamp = new Date(Number(blockTs) * 1000)
  const blockNum = Number(blockNumber)

  const from = getAddress(fromRaw)
  const to = getAddress(toRaw)
  const receiptTokenAddress = getAddress(address)

  const db = getDb()
  await db.transaction(async (tx) => {
    for (let i = 0; i < ids.length; i++) {
      // oxlint-disable-next-line no-await-in-loop
      await processTransfer({
        tx,
        chainId,
        txHash: transactionHash,
        logIndex,
        blockNumber: blockNum,
        blockTimestamp,
        receiptTokenAddress,
        tokenId: Number(ids[i]),
        from,
        to,
        value: values[i]!,
      })
    }
  })
}

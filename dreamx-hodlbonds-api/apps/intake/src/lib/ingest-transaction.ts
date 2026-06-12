import type { Hex } from "viem"

import { clients } from "@hodlbonds-api/blockchain"

import type { Log } from "../types/events"

import { decodeLogs } from "./event-decoder"
import { routeEvents } from "./event-router"
import { getEventStats } from "./replay"

/**
 * Ingest a transaction by fetching it from the blockchain
 * Useful for recovering missed events when webhooks fail
 *
 * @param chainId - Chain ID to fetch from
 * @param txHash - Transaction hash to ingest
 * @returns Stats after processing
 */
export async function ingestTransaction(
  chainId: number,
  txHash: Hex,
): Promise<{
  txHash: Hex
  blockNumber: number
  logsProcessed: number
  stats: Awaited<ReturnType<typeof getEventStats>>
}> {
  const client = clients[chainId as keyof typeof clients]
  if (!client) {
    throw new Error(`No client configured for chainId ${chainId}`)
  }

  console.log(`Fetching transaction receipt for ${txHash} on chain ${chainId}`)

  // Fetch transaction receipt (contains logs)
  const receipt = await client.getTransactionReceipt({ hash: txHash })

  if (!receipt) {
    throw new Error(`Transaction not found: ${txHash}`)
  }

  console.log(`Found transaction in block ${receipt.blockNumber} with ${receipt.logs.length} logs`)

  // Fetch block for timestamp metadata
  const block = await client.getBlock({ blockNumber: receipt.blockNumber })

  if (!block.timestamp) {
    throw new Error(`Block ${receipt.blockNumber} has no timestamp`)
  }

  // Transform viem logs to our custom Log format
  const logs: Log[] = receipt.logs.map((log) => ({
    chainId,
    address: log.address,
    topics: log.topics,
    data: log.data,
    blockNumber: log.blockNumber,
    blockTimestamp: block.timestamp,
    transactionHash: log.transactionHash,
    transactionIndex: log.transactionIndex,
    blockHash: log.blockHash,
    logIndex: log.logIndex,
  }))

  console.log(`Processing ${logs.length} logs`)

  // Decode and filter to only known events
  const events = decodeLogs(logs)

  console.log(`Found ${events.length} decodable events, processing through event router`)

  // Route through existingx event pipeline
  await routeEvents(events)

  // Get updated stats
  const stats = await getEventStats()

  return {
    txHash,
    blockNumber: Number(receipt.blockNumber),
    logsProcessed: events.length,
    stats,
  }
}

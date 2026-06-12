import { getDb } from "@hodlbonds-api/db"
import { intakeEvents } from "@hodlbonds-api/db/schema/index"
import { and, asc, count, eq } from "drizzle-orm"

import type { Event } from "../types/events"

import { routeEvents } from "./event-router"

/**
 * Replay all failed events
 * The router will automatically reset them to pending and retry processing
 * @param limit - Maximum number of events to replay (optional)
 */
export async function replayFailedEvents(limit?: number): Promise<void> {
  const db = getDb()
  const failedEvents = await db.query.intakeEvents.findMany({
    where: eq(intakeEvents.status, "failed"),
    limit: limit,
    orderBy: [asc(intakeEvents.blockNumber), asc(intakeEvents.logIndex)],
  })

  if (failedEvents.length === 0) {
    console.log("No failed events to replay")
    return
  }

  console.log(`Replaying ${failedEvents.length} failed events`)

  const events = failedEvents.map((e) => e.rawLog as Event)
  await routeEvents(events)
}

/**
 * Replay a specific event by its unique identifier
 * Useful for debugging or targeted retry
 * @param chainId - Chain ID of the event
 * @param txHash - Transaction hash
 * @param logIndex - Log index within the transaction
 */
export async function replayEvent(
  chainId: number,
  txHash: string,
  logIndex: number,
): Promise<void> {
  const db = getDb()
  const event = await db.query.intakeEvents.findFirst({
    where: and(
      eq(intakeEvents.chainId, chainId),
      eq(intakeEvents.txHash, txHash),
      eq(intakeEvents.logIndex, logIndex),
    ),
  })

  if (!event) {
    throw new Error(`Event not found: chainId=${chainId}, txHash=${txHash}, logIndex=${logIndex}`)
  }

  console.log(`Replaying event: ${event.eventName} (status: ${event.status})`)

  await routeEvents([event.rawLog as Event])
}

/**
 * Get summary of event processing status
 * Useful for monitoring
 */
export async function getEventStats(): Promise<{
  pending: number
  success: number
  failed: number
  total: number
}> {
  const db = getDb()
  const [pendingResult, successResult, failedResult, totalResult] = await Promise.all([
    db.select({ count: count() }).from(intakeEvents).where(eq(intakeEvents.status, "pending")),
    db.select({ count: count() }).from(intakeEvents).where(eq(intakeEvents.status, "success")),
    db.select({ count: count() }).from(intakeEvents).where(eq(intakeEvents.status, "failed")),
    db.select({ count: count() }).from(intakeEvents),
  ])

  return {
    pending: pendingResult[0]?.count ?? 0,
    success: successResult[0]?.count ?? 0,
    failed: failedResult[0]?.count ?? 0,
    total: totalResult[0]?.count ?? 0,
  }
}

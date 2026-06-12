import { getDb } from "@hodlbonds-api/db"
import { intakeEvents } from "@hodlbonds-api/db/schema/index"
import { and, eq, sql } from "drizzle-orm"

import type { Event, Log } from "../types/events"

import { decodeLog } from "./event-decoder"
import { getEventHandler, isSupportedEvent } from "./event-handlers"

/**
 * Routes raw logs through decode → handle pipeline
 * Stores raw logs immediately (never lost), then decodes and processes
 * Updates with final state (success/failed + decoded data) after processing
 *
 * Flow:
 * 1. INSERT raw logs immediately (status='pending', eventName/args=null)
 * 2. For each pending log:
 *    a. Decode in memory
 *    b. Handle in memory (handler does its own DB work)
 *    c. Single UPDATE with final state
 *
 * @param logs - Array of standardized Log objects to process
 */
export async function routeEvents(logs: Log[]): Promise<void> {
  if (logs.length === 0) return

  const db = getDb()

  // Step 1: Insert all raw logs immediately
  // - New logs: inserted as pending with eventName/args null
  // - Success logs: skipped (remain success)
  // - Failed logs: reset to pending for retry
  const insertedLogs = await db
    .insert(intakeEvents)
    .values(
      logs.map((log) => ({
        chainId: log.chainId,
        txHash: log.transactionHash,
        logIndex: log.logIndex!,
        blockNumber: Number(log.blockNumber),
        blockTimestamp: log.blockTimestamp ? new Date(Number(log.blockTimestamp) * 1000) : null,
        rawLog: log,
        status: "pending" as const,
        // eventName and args are null until decode succeeds
      })),
    )
    .onConflictDoUpdate({
      target: [intakeEvents.chainId, intakeEvents.txHash, intakeEvents.logIndex],
      set: {
        // Reset failed logs to pending, keep success as success
        status: sql`CASE 
          WHEN ${intakeEvents.status} = 'failed' THEN 'pending'::event_status
          ELSE ${intakeEvents.status}
        END`,
        error: sql`CASE 
          WHEN ${intakeEvents.status} = 'failed' THEN NULL
          ELSE ${intakeEvents.error}
        END`,
        // Clear eventName/args for failed retries (will be re-decoded)
        eventName: sql`CASE 
          WHEN ${intakeEvents.status} = 'failed' THEN NULL
          ELSE ${intakeEvents.eventName}
        END`,
        args: sql`CASE 
          WHEN ${intakeEvents.status} = 'failed' THEN NULL
          ELSE ${intakeEvents.args}
        END`,
        // Update rawLog and blockTimestamp for failed entries (allows fresh data on retry)
        rawLog: sql`CASE 
          WHEN ${intakeEvents.status} = 'failed' THEN excluded.raw_log
          ELSE ${intakeEvents.rawLog}
        END`,
        blockTimestamp: sql`CASE 
          WHEN ${intakeEvents.status} = 'failed' THEN excluded.block_timestamp
          ELSE ${intakeEvents.blockTimestamp}
        END`,
      },
    })
    .returning()

  // Filter to only process pending logs (new or reset failed)
  const logsToProcess = insertedLogs.filter((l) => l.status === "pending")

  if (logsToProcess.length === 0) {
    console.log("No pending logs to process")
    return
  }

  const duplicateCount = logs.length - logsToProcess.length
  console.log(
    `Processing ${logsToProcess.length} logs${duplicateCount > 0 ? ` (${duplicateCount} already processed)` : ""}`,
  )

  // Step 2: Process each pending log (decode → handle → update)
  let deletedCount = 0
  const results = await Promise.allSettled(
    logsToProcess.map(async (inserted) => {
      const rawLog = inserted.rawLog as Log
      let decodedEvent: Event | null = null

      try {
        // Step 2a: Decode in memory
        decodedEvent = decodeLog(rawLog)
        if (!decodedEvent) {
          throw new Error("Unknown event signature")
        }

        // Check if we have a handler for this event
        if (!isSupportedEvent(decodedEvent.eventName)) {
          // Event decoded successfully but we don't process it - delete from DB
          await db
            .delete(intakeEvents)
            .where(
              and(
                eq(intakeEvents.chainId, inserted.chainId),
                eq(intakeEvents.txHash, inserted.txHash),
                eq(intakeEvents.logIndex, inserted.logIndex),
              ),
            )
          deletedCount++
          return // Skip processing, don't mark as success or failure
        }

        // Step 2b: Handle in memory (handler does its own DB work)
        const handler = getEventHandler(decodedEvent.eventName)
        await handler(decodedEvent)

        // Step 2c: Single update with success state
        await db
          .update(intakeEvents)
          .set({
            status: "success",
            eventName: decodedEvent.eventName,
            args: decodedEvent.args,
            processedAt: new Date(),
          })
          .where(
            and(
              eq(intakeEvents.chainId, inserted.chainId),
              eq(intakeEvents.txHash, inserted.txHash),
              eq(intakeEvents.logIndex, inserted.logIndex),
            ),
          )
      } catch (error) {
        // Step 2c: Single update with failed state
        const errorMessage = error instanceof Error ? error.message : String(error)

        await db
          .update(intakeEvents)
          .set({
            status: "failed",
            error: errorMessage,
            // Include decoded data if decode succeeded but handler failed
            eventName: decodedEvent?.eventName ?? null,
            args: decodedEvent?.args ?? null,
            processedAt: new Date(),
          })
          .where(
            and(
              eq(intakeEvents.chainId, inserted.chainId),
              eq(intakeEvents.txHash, inserted.txHash),
              eq(intakeEvents.logIndex, inserted.logIndex),
            ),
          )

        throw error // Re-throw to be caught by Promise.allSettled
      }
    }),
  )

  // Log summary
  const failures = results.filter((r) => r.status === "rejected")
  const successes = results.filter((r) => r.status === "fulfilled")
  console.log(
    `Processed ${successes.length} logs successfully, ${failures.length} failed${deletedCount > 0 ? `, ${deletedCount} unsupported events discarded` : ""}`,
  )

  if (failures.length > 0) {
    console.error(`Failed logs:`, failures)

    // Log detailed error info including cause chain
    for (const failure of failures) {
      if (failure.status === "rejected") {
        const err = failure.reason
        console.error(`[error] Message: ${err?.message}`)
        if (err?.cause) {
          const cause = err.cause as Error
          console.error(`[error] Cause: ${cause?.message}`)
          // Log additional Postgres error details if available
          const pgError = cause as any
          if (pgError?.code) console.error(`[error] PG Code: ${pgError.code}`)
          if (pgError?.detail) console.error(`[error] PG Detail: ${pgError.detail}`)
          if (pgError?.constraint) console.error(`[error] PG Constraint: ${pgError.constraint}`)
          if (pgError?.column) console.error(`[error] PG Column: ${pgError.column}`)
        }
      }
    }

    // Note: We still return successfully to the webhook provider
    // Failed logs are tracked in DB and can be replayed
  }
}

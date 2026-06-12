import { getDb } from "@hodlbonds-api/db"
import { tradeRequests } from "@hodlbonds-api/db/schema"
import { env } from "@hodlbonds-api/env/trading-api"
import { eq } from "drizzle-orm"
import { Hono } from "hono"
import * as z from "zod"

import { errors } from "@/lib/errors"
import { verifyPubSubOidcToken } from "@/lib/pubsub-auth"
import { ExecutorStatusUpdateSchema, PubSubPushMessageSchema } from "@/schemas/executor"

export const orderStatusRouter = new Hono()

orderStatusRouter.post("/", async (c) => {
  const authHeader = c.req.header("Authorization")
  const isValid = await verifyPubSubOidcToken(
    authHeader,
    env.SERVICE_URL,
    env.PUBSUB_SERVICE_ACCOUNT_EMAIL,
  )

  if (!isValid) {
    throw errors.unauthorized("Invalid OIDC token on order status update")
  }

  const body = await c.req.json()
  const pushResult = PubSubPushMessageSchema.safeParse(body)

  if (!pushResult.success) {
    console.error("Invalid PubSub push message:", z.treeifyError(pushResult.error))
    return c.json({ error: "Invalid push message format" }, 200)
  }

  const dataResult = ExecutorStatusUpdateSchema.safeParse(
    (() => {
      try {
        return JSON.parse(Buffer.from(pushResult.data.message.data, "base64").toString())
      } catch {
        return null
      }
    })(),
  )

  if (!dataResult.success) {
    console.error("Failed to decode/validate status update:", z.treeifyError(dataResult.error))
    return c.json({ error: "Invalid status update" }, 200)
  }

  const data = dataResult.data

  console.log("Received order status update:", {
    clientOrderId: data.clientOrderId,
    status: data.status,
    pubsubMessageId: pushResult.data.message.messageId,
    ...(data.txHash && { txHash: data.txHash }),
    ...(data.taskId && { taskId: data.taskId }),
  })

  const db = getDb()

  // Fetch current state to validate transitions
  const currentRequest = await db.query.tradeRequests.findFirst({
    where: eq(tradeRequests.clientOrderId, data.clientOrderId),
    columns: {
      id: true,
      status: true,
      lastStatusAt: true,
    },
  })

  if (!currentRequest) {
    console.warn(`No trade request found for clientOrderId: ${data.clientOrderId}`)
    return c.json({ success: true })
  }

  // Terminal states - never update once reached
  if (currentRequest.status === "executed" || currentRequest.status === "failed") {
    console.warn(
      `Ignoring status update for ${data.clientOrderId}: already in terminal state '${currentRequest.status}'`,
    )
    return c.json({ success: true })
  }

  // Timestamp ordering - ignore stale updates
  const incomingTimestamp = new Date(data.timestamp)
  if (currentRequest.lastStatusAt && incomingTimestamp <= currentRequest.lastStatusAt) {
    console.warn(
      `Ignoring stale status update for ${data.clientOrderId}: incoming timestamp ${data.timestamp} is not newer than current ${currentRequest.lastStatusAt.toISOString()}`,
    )
    return c.json({ success: true })
  }

  const updateData: Record<string, unknown> = {
    status: data.status,
    lastStatusAt: incomingTimestamp,
  }

  if (data.status === "executed" && data.txHash) {
    updateData.executedAt = incomingTimestamp
    updateData.txHash = data.txHash
  }

  const result = await db
    .update(tradeRequests)
    .set(updateData)
    .where(eq(tradeRequests.clientOrderId, data.clientOrderId))
    .returning({ id: tradeRequests.id })

  if (result.length === 0) {
    console.warn(`Failed to update trade request for clientOrderId: ${data.clientOrderId}`)
  }

  return c.json({ success: true })
})

import { z } from "@hono/zod-openapi"

import { ClientOrderIdSchema, TradeRequestStatusSchema, TxHashSchema } from "@/schemas"

// --- Executor Status Update ---

export const ExecutorStatusUpdateSchema = z.object({
  clientOrderId: ClientOrderIdSchema,
  status: TradeRequestStatusSchema,
  timestamp: z.iso.datetime(),
  txHash: TxHashSchema.optional(),
  taskId: z.string().optional(),
})

// --- PubSub Push Envelope ---

export const PubSubPushMessageSchema = z.object({
  message: z.object({
    data: z.string(), // Base64 encoded JSON
    messageId: z.string(),
    publishTime: z.string(),
  }),
  subscription: z.string(),
})

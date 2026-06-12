import type { z } from "zod"

import type { TradeRequestStatusSchema } from "@/schemas"
import type { ExecutorStatusUpdateSchema, PubSubPushMessageSchema } from "@/schemas/executor"

export type ExecutorOrderStatus = z.infer<typeof TradeRequestStatusSchema>
export type ExecutorStatusUpdate = z.infer<typeof ExecutorStatusUpdateSchema>
export type PubSubPushMessage = z.infer<typeof PubSubPushMessageSchema>

import { PubSub } from "@google-cloud/pubsub"
import * as z from "zod"

const OrderStatusUpdateSchema = z.object({
  clientOrderId: z
    .string()
    .length(32)
    .regex(/^[a-f0-9]+$/i, "Must be a valid UUID4 without hyphens (32 hex characters)"),
  status: z.enum(["submitted", "pending", "retry", "executed", "failed"]),
  timestamp: z.iso.datetime(),
  txHash: z
    .string()
    .regex(/^0x[a-fA-F0-9]{64}$/, "Must be a valid transaction hash")
    .optional(),
})

export type OrderStatusUpdate = z.infer<typeof OrderStatusUpdateSchema>

/**
 * Client for publishing order status updates back to the trading-api
 */
export class TradingApiClient {
  private pubsub: PubSub
  private topicPath: string

  constructor(topicPath: string) {
    this.pubsub = new PubSub()
    this.topicPath = topicPath
  }

  /**
   * Publishes an order status update to the trading-api
   * @returns PubSub message ID
   */
  async publishOrderStatusUpdate(update: OrderStatusUpdate): Promise<string> {
    const parsedUpdate = OrderStatusUpdateSchema.parse(update)

    const topic = this.pubsub.topic(this.topicPath)
    const data = Buffer.from(JSON.stringify(parsedUpdate))
    return await topic.publishMessage({ data })
  }
}

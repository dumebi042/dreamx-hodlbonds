import type { Data, Executor, Network } from "@/common"
import type { MessageParams } from "@/schemas/message-schema"

import { MessageParamsSchema } from "@/schemas/message-schema"

export class Message<TData extends Data = Data> {
  priority: number
  earliestTry: number
  latestTry: number | null
  shouldRetry: boolean
  network: Network
  executor: Executor
  data: TData

  constructor(message: MessageParams) {
    const processedEarliestTry =
      message.earliestTry === -1 ? Math.floor(Date.now() / 1000) : message.earliestTry

    const processedLatestTry =
      message.latestTry === null
        ? null
        : Math.floor(message.latestTry) < 1000000000
          ? Math.floor(Date.now() / 1000) + message.latestTry
          : message.latestTry

    const validated = MessageParamsSchema.parse({
      ...message,
      earliestTry: processedEarliestTry,
      latestTry: processedLatestTry,
    })
    this.priority = validated.priority
    this.earliestTry = validated.earliestTry
    this.latestTry = validated.latestTry
    this.shouldRetry = validated.shouldRetry
    this.network = validated.network
    this.executor = validated.executor
    this.data = validated.data as TData
  }
}

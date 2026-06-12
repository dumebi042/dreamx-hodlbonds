// oxlint-disable max-classes-per-file
import * as z from "zod"

import { Message } from "@/message"
import { EthereumAddress } from "@/schemas"
import { Task } from "@/task"

export type DcaBotFixedBuyOrder = z.infer<typeof DcaBotFixedBuyOrderSchema>
export const DcaBotFixedBuyOrderSchema = z.object({
  address: EthereumAddress,
  tokenToSellAmount: z.number().positive(),
  active: z.boolean(),
  decimals: z.number().int().positive(),
})

export type DcaBotFixedData = z.infer<typeof DcaBotFixedDataSchema>
export const DcaBotFixedDataSchema = z.object({
  tokenToSell: EthereumAddress,
  tokenToSellDecimals: z.number().int().positive(),
  buyOrders: z.array(DcaBotFixedBuyOrderSchema),
})

export class DcaBotFixedMessage extends Message<DcaBotFixedData> {
  constructor(message: DcaBotFixedMessage) {
    super(message)

    this.data = DcaBotFixedDataSchema.parse(message.data)
  }
}

export class DcaBotFixedTask extends Task<DcaBotFixedData> {
  constructor(task: Task) {
    super(task)

    this.data = DcaBotFixedDataSchema.parse(task.data)
  }

  static override fromTask(task: Task): DcaBotFixedTask {
    return new DcaBotFixedTask(task)
  }
}

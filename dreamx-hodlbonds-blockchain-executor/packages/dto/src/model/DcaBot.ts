// oxlint-disable max-classes-per-file
import * as z from "zod"

import { Message } from "@/message"
import { EthereumAddress } from "@/schemas"
import { Task } from "@/task"

export type DcaBotBuyOrder = z.infer<typeof DcaBotBuyOrderSchema>
export const DcaBotBuyOrderSchema = z.object({
  address: EthereumAddress,
  dollarAmount: z.number().positive(),
  active: z.boolean(),
  decimals: z.number().int().positive(),
})

export type DcaBotData = z.infer<typeof DcaBotDataSchema>
export const DcaBotDataSchema = z.object({
  tokenToSell: EthereumAddress,
  tokenToSellDecimals: z.number().int().positive(),
  baseDollarToken: EthereumAddress,
  baseDollarDecimals: z.number().int().positive(),
  buyOrders: z.array(DcaBotBuyOrderSchema),
})

export class DcaBotMessage extends Message<DcaBotData> {
  constructor(message: DcaBotMessage) {
    super(message)

    this.data = DcaBotDataSchema.parse(message.data)
  }
}

export class DcaBotTask extends Task<DcaBotData> {
  constructor(task: Task) {
    super(task)

    this.data = DcaBotDataSchema.parse(task.data)
  }

  static override fromTask(task: Task): DcaBotTask {
    return new DcaBotTask(task)
  }
}

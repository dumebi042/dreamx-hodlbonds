// oxlint-disable max-classes-per-file
import * as z from "zod"

import { Message } from "@/message"
import { EthereumAddress, PositiveIntegerString, UnixTimestampSecondsAfter2001 } from "@/schemas"
import { Task } from "@/task"

export enum HodlBondsTradeOp {
  UNISWAP_EXACT_IN = "UNISWAP_EXACT_IN",
  LFJ_EXACT_IN = "LFJ_EXACT_IN",
  BLACKHOLE_EXACT_IN = "BLACKHOLE_EXACT_IN",
}

export type HodlBondsTradeData = z.infer<typeof HodlBondsTradeDataSchema>
export type UniswapExactInData = Extract<
  HodlBondsTradeData,
  { op: HodlBondsTradeOp.UNISWAP_EXACT_IN }
>
export type LFJExactInData = Extract<HodlBondsTradeData, { op: HodlBondsTradeOp.LFJ_EXACT_IN }>
export type BlackholeExactInData = Extract<
  HodlBondsTradeData,
  { op: HodlBondsTradeOp.BLACKHOLE_EXACT_IN }
>

const ClientOrderId = z
  .string()
  .length(32)
  .regex(/^[a-f0-9]+$/i, "Must be a valid UUID4 without hyphens (32 hex characters)")

export const HodlBondsTradeDataSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal(HodlBondsTradeOp.UNISWAP_EXACT_IN),
    clientOrderId: ClientOrderId,
    poolAddress: EthereumAddress,
    quantity: PositiveIntegerString,
    minAmountOut: PositiveIntegerString,
    deadline: UnixTimestampSecondsAfter2001,
    zeroForOne: z.boolean(),
  }),
  z.object({
    op: z.literal(HodlBondsTradeOp.LFJ_EXACT_IN),
    clientOrderId: ClientOrderId,
    poolAddress: EthereumAddress,
    inputToken: EthereumAddress,
    quantity: PositiveIntegerString,
    minAmountOut: PositiveIntegerString,
    deadline: UnixTimestampSecondsAfter2001,
  }),
  z.object({
    op: z.literal(HodlBondsTradeOp.BLACKHOLE_EXACT_IN),
    clientOrderId: ClientOrderId,
    poolAddress: EthereumAddress,
    inputToken: EthereumAddress,
    quantity: PositiveIntegerString,
    minAmountOut: PositiveIntegerString,
    deadline: UnixTimestampSecondsAfter2001,
  }),
])

export class HodlBondsTradeMessage extends Message<HodlBondsTradeData> {
  constructor(message: HodlBondsTradeMessage) {
    super(message)

    this.data = HodlBondsTradeDataSchema.parse(message.data)
  }
}

export class HodlBondsTradeTask extends Task<HodlBondsTradeData> {
  constructor(task: Task) {
    super(task)

    this.data = HodlBondsTradeDataSchema.parse(task.data)
  }

  static override fromTask(task: Task): HodlBondsTradeTask {
    return new HodlBondsTradeTask(task)
  }
}

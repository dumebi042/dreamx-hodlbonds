import * as z from "zod"

import { Executor, Network } from "@/common"
import { UnixTimestampSecondsAfter2001 } from "@/schemas"

export type MessageParams = z.infer<typeof MessageParamsSchema>
export const MessageParamsSchema = z.object({
  priority: z.number().int().positive(),
  earliestTry: UnixTimestampSecondsAfter2001,
  latestTry: UnixTimestampSecondsAfter2001.nullable(),
  shouldRetry: z.boolean(),
  network: z.enum(Network),
  executor: z.enum(Executor),
  data: z.preprocess(
    (v) => {
      if (typeof v === "string") {
        try {
          return JSON.parse(v)
        } catch {
          return v
        }
      }
      return v
    },
    z.record(z.string(), z.unknown()),
  ),
})

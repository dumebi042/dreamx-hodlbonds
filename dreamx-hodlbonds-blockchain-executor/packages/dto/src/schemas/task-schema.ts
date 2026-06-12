import * as z from "zod"

import { Executor, Network, Status } from "@/common"

export type TaskInput = z.infer<typeof TaskInputSchema>
export const TaskInputSchema = z.object({
  id: z.number().int().positive(),
  status: z.enum(Status),
  priority: z.number().int().positive(),
  earliest_try_unix: z.number().int(),
  latest_try_unix: z.number().int().nullable(),
  should_retry: z.boolean(),
  attempts: z.number().int().nonnegative(),
  next_attempt_unix: z.number().int().nullable(),
  network: z.enum(Network),
  executor: z.enum(Executor),
  data: z.record(z.string(), z.unknown()),
})

export type TaskParams = z.infer<typeof TaskParamsSchema>
export const TaskParamsSchema = z.object({
  id: z.number().int().positive(),
  status: z.enum(Status),
  attempts: z.number().int().nonnegative(),
  nextAttempt: z.number().int().nullable(),
})

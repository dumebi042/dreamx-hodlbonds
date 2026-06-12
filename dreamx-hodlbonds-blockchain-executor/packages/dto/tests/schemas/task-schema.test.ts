import { describe, it, expect } from "vitest"
import * as z from "zod"

import { Executor, Network, Status } from "@/common"
import { TaskInputSchema, TaskParamsSchema, type TaskInput } from "@/schemas/task-schema"

describe("Task schemas", () => {
  it("parses valid TaskInput", () => {
    const input: TaskInput = {
      id: 1,
      status: Status.QUEUED,
      priority: 2,
      earliest_try_unix: 1600000000,
      latest_try_unix: null,
      should_retry: true,
      attempts: 1,
      next_attempt_unix: null,
      network: Network.tst,
      executor: Executor.UnitTest,
      data: { foo: "bar" },
    }

    const res = TaskInputSchema.parse(input)
    expect(res.id).toBe(1)
    expect(res.data).toEqual({ foo: "bar" })
  })

  it("validates TaskParams and errors on wrong types", () => {
    const good = { id: 5, status: Status.QUEUED, attempts: 1, nextAttempt: null }
    const parsed = TaskParamsSchema.parse(good)
    expect(parsed.id).toBe(5)

    expect(() => TaskParamsSchema.parse({ id: "nope" })).toThrow(z.ZodError)
  })
})

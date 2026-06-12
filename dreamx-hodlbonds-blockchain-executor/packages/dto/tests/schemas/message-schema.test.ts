import { describe, it, expect } from "vitest"
import * as z from "zod"

import type { Message } from "@/message"

import { Executor, Network } from "@/common"
import { MessageParamsSchema } from "@/schemas/message-schema"

describe("MessageParamsSchema", () => {
  it("parses object data unchanged", () => {
    const input = {
      priority: 1,
      earliestTry: 1600000000,
      latestTry: null,
      shouldRetry: true,
      network: "tst",
      executor: "UnitTest",
      data: { a: 1, b: "x" },
    }

    const res = MessageParamsSchema.parse(input)
    expect(res.data).toEqual({ a: 1, b: "x" })
  })

  it("preprocesses JSON-string data into an object", () => {
    const input = {
      priority: 1,
      earliestTry: 1600000000,
      latestTry: null,
      shouldRetry: true,
      network: "tst",
      executor: "UnitTest",
      data: JSON.stringify({ a: 2, nested: { ok: true } }),
    }

    const res = MessageParamsSchema.parse(input)
    expect(res.data).toEqual({ a: 2, nested: { ok: true } })
  })

  it("throws when data is a non-JSON string", () => {
    const input: Message = {
      priority: 1,
      earliestTry: 1600000000,
      latestTry: null,
      shouldRetry: true,
      network: Network.tst,
      executor: Executor.UnitTest,
      /* @ts-expect-error testing runtime invalid */
      data: "not json",
    }

    let caught: any = null
    try {
      MessageParamsSchema.parse(input)
    } catch (err: any) {
      caught = err
    }

    expect(caught).toBeInstanceOf(z.ZodError)
    expect(caught.issues[0].path[0]).toBe("data")
  })
})

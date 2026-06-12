// oxlint-disable consistent-function-scoping
import { describe, it, expect } from "vitest"
import * as z from "zod"

import {
  captureError,
  captureErrorAsync,
  captureZodError,
  captureZodErrorAsync,
} from "@/utils/test-utils"

describe("Test Utils", () => {
  it("captureError: Captures Error from thrown function", () => {
    expect.assertions(3)

    const throwErrorFunction = () => {
      throw new Error("This is a test error")
    }

    const err = captureError(throwErrorFunction)
    expect(err).toBeDefined()
    expect(err).toBeInstanceOf(Error)
    expect(err as Error).toHaveProperty(".message", "This is a test error")
  })

  it("captureError: throws if no error is thrown", () => {
    expect.assertions(1)

    const noErrorFunction = () => {
      return null
    }

    expect(() => captureError(noErrorFunction)).toThrow("Expected function to throw")
  })

  it("captureErrorAsync: Captures Error from thrown async function", async () => {
    expect.assertions(3)

    const throwErrorAsyncFunction = async () => {
      await Promise.reject(new Error("This is a test async error"))
    }

    const err = await captureErrorAsync(throwErrorAsyncFunction)
    expect(err).toBeDefined()
    expect(err).toBeInstanceOf(Error)
    expect(err as Error).toHaveProperty(".message", "This is a test async error")
  })

  it("captureErrorAsync: throws if no error is thrown", async () => {
    expect.assertions(1)

    const noErrorFunction = async () => {
      await Promise.resolve()
    }

    await expect(captureErrorAsync(noErrorFunction)).rejects.toThrow("Expected function to throw")
  })

  it("captureZodError: throws if no ZodError is thrown", () => {
    expect.assertions(1)

    const noErrorFunction = () => {
      throw new Error("Some other error")
    }

    expect(() => captureZodError(noErrorFunction)).toThrow("Did not receive a ZodError")
  })

  it("captureZodError: Captures ZodError from thrown function", () => {
    expect.assertions(3)

    const throwZodError = () => {
      const schema = z.object({
        name: z.string(),
      })
      schema.parse({ name: 123 }) // Invalid input to trigger ZodError
    }

    const err = captureZodError(throwZodError)
    expect(err).toBeDefined()
    expect(err.issues).toBeDefined()
    expect(err.issues[0]?.message).toBe("Invalid input: expected string, received number")
  })

  it("captureZodErrorAsync: throws if no ZodError is thrown", async () => {
    expect.assertions(1)

    const noErrorAsyncFunction = async () => {
      await Promise.reject(() => {
        throw new Error("Some other error")
      })
    }

    await expect(captureZodErrorAsync(noErrorAsyncFunction)).rejects.toThrow(
      "Did not receive a ZodError",
    )
  })

  it("captureZodErrorAsync: Captures ZodError from thrown async function", async () => {
    expect.assertions(3)

    const throwZodErrorAsync = async () => {
      const schema = z.object({
        name: z.string(),
      })
      await schema.parseAsync({ name: 123 }) // Invalid input to trigger ZodError
    }

    const err = await captureZodErrorAsync(throwZodErrorAsync)
    expect(err).toBeDefined()
    expect(err.issues).toBeDefined()
    expect(err.issues[0]?.message).toBe("Invalid input: expected string, received number")
  })
})

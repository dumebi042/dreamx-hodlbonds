import { describe, it, expect, vi } from "vitest"

import { Message } from "@/message"
import { captureZodError, mockMessage } from "@/utils/test-utils"

describe("Message", () => {
  it("constructor: Stores correct values", () => {
    expect.assertions(6)

    const instance = new Message(mockMessage)

    expect(instance.priority).toBe(mockMessage.priority)
    expect(instance.earliestTry).toBe(mockMessage.earliestTry)
    expect(instance.latestTry).toBe(mockMessage.latestTry)
    expect(instance.shouldRetry).toBe(mockMessage.shouldRetry)
    expect(instance.network).toBe(mockMessage.network)
    expect(instance.executor).toBe(mockMessage.executor)
  })

  it("constructor: Stores correct values, earliestTry: -1", () => {
    expect.assertions(6)

    const modifiedMockMessage = {
      ...mockMessage,
      earliestTry: -1,
    }

    const mockTime = 1234567890

    const dateNowSpy = vi.spyOn(Date, "now")
    dateNowSpy.mockReturnValueOnce(mockTime * 1000)

    const instance = new Message(modifiedMockMessage)

    expect(instance.priority).toBe(mockMessage.priority)
    expect(instance.earliestTry).toBe(mockTime)
    expect(instance.latestTry).toBe(mockMessage.latestTry)
    expect(instance.shouldRetry).toBe(mockMessage.shouldRetry)
    expect(instance.network).toBe(mockMessage.network)
    expect(instance.executor).toBe(mockMessage.executor)
  })

  it("constructor: Stores correct values, latestTry: null", () => {
    expect.assertions(6)

    const modifiedMockMessage = {
      ...mockMessage,
      latestTry: null,
    }
    const instance = new Message(modifiedMockMessage)

    expect(instance.priority).toBe(mockMessage.priority)
    expect(instance.earliestTry).toBe(mockMessage.earliestTry)
    expect(instance.latestTry).toBe(null)
    expect(instance.shouldRetry).toBe(mockMessage.shouldRetry)
    expect(instance.network).toBe(mockMessage.network)
    expect(instance.executor).toBe(mockMessage.executor)
  })

  it("constructor: Stores correct values, latestTry: less than 2001.09.01", () => {
    expect.assertions(6)

    const modifiedMockMessage = {
      ...mockMessage,
      latestTry: 86400,
    }

    const mockTime = 1234567890

    const dateNowSpy = vi.spyOn(Date, "now")
    dateNowSpy.mockReturnValueOnce(mockTime * 1000)

    const instance = new Message(modifiedMockMessage)

    expect(instance.priority).toBe(mockMessage.priority)
    expect(instance.earliestTry).toBe(mockMessage.earliestTry)
    expect(instance.latestTry).toBe(mockTime + modifiedMockMessage.latestTry)
    expect(instance.shouldRetry).toBe(mockMessage.shouldRetry)
    expect(instance.network).toBe(mockMessage.network)
    expect(instance.executor).toBe(mockMessage.executor)
  })

  it("constructor: Throws on incorrect values", () => {
    expect.assertions(13)

    expect(() => new Message(mockMessage)).not.toThrow()

    const invalidPriority = { ...mockMessage, priority: undefined }
    /* @ts-expect-error testing invalid input */
    const err = captureZodError(() => new Message(invalidPriority))
    expect(err.issues[0]?.path[0]).toBe("priority")
    expect(err.issues[0]?.message).toBe("Invalid input: expected number, received undefined")

    const invalidEarliestTry = { ...mockMessage, earliestTry: undefined }
    /* @ts-expect-error testing invalid input */
    const err2 = captureZodError(() => new Message(invalidEarliestTry))
    expect(err2.issues[0]?.path[0]).toBe("earliestTry")
    expect(err2.issues[0]?.message).toBe("Invalid input: expected number, received undefined")

    const invalidLatestTry = { ...mockMessage, latestTry: undefined }
    /* @ts-expect-error testing invalid input */
    const err3 = captureZodError(() => new Message(invalidLatestTry))
    expect(err3.issues[0]?.path[0]).toBe("latestTry")
    expect(err3.issues[0]?.message).toBe("Invalid input: expected number, received undefined")

    const invalidShouldRetry = { ...mockMessage, shouldRetry: undefined }
    /* @ts-expect-error testing invalid input */
    const err4 = captureZodError(() => new Message(invalidShouldRetry))
    expect(err4.issues[0]?.path[0]).toBe("shouldRetry")
    expect(err4.issues[0]?.message).toBe("Invalid input: expected boolean, received undefined")

    const invalidNetwork = { ...mockMessage, network: undefined }
    /* @ts-expect-error testing invalid input */
    const err5 = captureZodError(() => new Message(invalidNetwork))
    expect(err5.issues[0]?.path[0]).toBe("network")
    expect(err5.issues[0]?.message).toMatch("Invalid option")

    const invalidExecutor = { ...mockMessage, executor: undefined }
    /* @ts-expect-error testing invalid input */
    const err6 = captureZodError(() => new Message(invalidExecutor))
    expect(err6.issues[0]?.path[0]).toBe("executor")
    expect(err6.issues[0]?.message).toBe(
      'Invalid option: expected one of "DcaBot"|"DcaBotFixed"|"HodlBondsTrade"|"UnitTest"',
    )
  })
})

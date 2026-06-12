import { describe, it, expect } from "vitest"

import { Task } from "@/task"
import { captureZodError, mockTaskInput } from "@/utils/test-utils"

describe("Task", () => {
  it("Constructor: Create task from TaskInput", () => {
    expect.assertions(12)

    const task = new Task(mockTaskInput)

    expect(task.id).toBe(mockTaskInput.id)
    expect(task.status).toBe(mockTaskInput.status)
    expect(task.priority).toBe(mockTaskInput.priority)
    expect(task.earliestTry).toBe(mockTaskInput.earliest_try_unix)
    expect(task.latestTry).toBe(mockTaskInput.latest_try_unix)
    expect(task.shouldRetry).toBe(mockTaskInput.should_retry)
    expect(task.attempts).toBe(mockTaskInput.attempts)
    expect(task.nextAttempt).toBe(mockTaskInput.next_attempt_unix)
    expect(task.network).toBe(mockTaskInput.network)
    expect(task.executor).toBe(mockTaskInput.executor)

    const taskInputShouldRetryFalse = { ...mockTaskInput, should_retry: false }
    const task2 = new Task(taskInputShouldRetryFalse)

    expect(task2.shouldRetry).toBe(false)

    const taskInputLatestTryNull = { ...mockTaskInput, latest_try_unix: null }
    const task3 = new Task(taskInputLatestTryNull)

    expect(task3.latestTry).toBe(null)
  })

  it("Constructor: Create task from Task", () => {
    expect.assertions(11)

    const taskFromInput = new Task(mockTaskInput)
    const task = new Task(taskFromInput)

    expect(task.id).toBe(taskFromInput.id)
    expect(task.status).toBe(taskFromInput.status)
    expect(task.priority).toBe(taskFromInput.priority)
    expect(task.earliestTry).toBe(taskFromInput.earliestTry)
    expect(task.latestTry).toBe(taskFromInput.latestTry)
    expect(task.shouldRetry).toBe(taskFromInput.shouldRetry)
    expect(task.attempts).toBe(taskFromInput.attempts)
    expect(task.nextAttempt).toBe(taskFromInput.nextAttempt)
    expect(task.network).toBe(taskFromInput.network)
    expect(task.executor).toBe(taskFromInput.executor)
    expect(task.data).toStrictEqual(mockTaskInput.data)
  })

  it("Constructor: Throws on invalid input", () => {
    expect.assertions(20)

    const invalidId = { ...mockTaskInput, id: "abc" }
    /* @ts-expect-error testing invalid input */
    const err = captureZodError(() => new Task(invalidId))
    expect(err.issues[0]?.path[0]).toBe("id")
    expect(err.issues[0]?.message).toBe("Invalid input: expected number, received string")

    const invalidStatus = { ...mockTaskInput, status: "status with space" }
    /* @ts-expect-error testing invalid input */
    const err2 = captureZodError(() => new Task(invalidStatus))
    expect(err2.issues[0]?.path[0]).toBe("status")
    expect(err2.issues[0]?.message).toBe(
      'Invalid option: expected one of "ERROR_RETRY"|"ERROR_NO_RETRY"|"EXCEPTION"|"EXECUTED"|"EXECUTING"|"QUEUED"',
    )

    const invalidPriority = { ...mockTaskInput, priority: "abc" }
    /* @ts-expect-error testing invalid input */
    const err3 = captureZodError(() => new Task(invalidPriority))
    expect(err3.issues[0]?.path[0]).toBe("priority")
    expect(err3.issues[0]?.message).toBe("Invalid input: expected number, received string")

    const invalidEarliestTry = { ...mockTaskInput, earliest_try_unix: "abc" }
    /* @ts-expect-error testing invalid input */
    const err4 = captureZodError(() => new Task(invalidEarliestTry))
    expect(err4.issues[0]?.path[0]).toBe("earliest_try_unix")
    expect(err4.issues[0]?.message).toBe("Invalid input: expected number, received string")

    const invalidLatestTry = { ...mockTaskInput, latest_try_unix: "abc" }
    /* @ts-expect-error testing invalid input */
    const err5 = captureZodError(() => new Task(invalidLatestTry))
    expect(err5.issues[0]?.path[0]).toBe("latest_try_unix")
    expect(err5.issues[0]?.message).toBe("Invalid input: expected number, received string")

    const invalidShouldRetry = { ...mockTaskInput, should_retry: "abc" }
    /* @ts-expect-error testing invalid input */
    const err6 = captureZodError(() => new Task(invalidShouldRetry))
    expect(err6.issues[0]?.path[0]).toBe("should_retry")
    expect(err6.issues[0]?.message).toBe("Invalid input: expected boolean, received string")

    const invalidAttempts = { ...mockTaskInput, attempts: "abc" }
    /* @ts-expect-error testing invalid input */
    const err7 = captureZodError(() => new Task(invalidAttempts))
    expect(err7.issues[0]?.path[0]).toBe("attempts")
    expect(err7.issues[0]?.message).toBe("Invalid input: expected number, received string")

    const invalidNextAttempt = { ...mockTaskInput, next_attempt_unix: "abc" }
    /* @ts-expect-error testing invalid input */
    const err8 = captureZodError(() => new Task(invalidNextAttempt))
    expect(err8.issues[0]?.path[0]).toBe("next_attempt_unix")
    expect(err8.issues[0]?.message).toBe("Invalid input: expected number, received string")

    const invalidNetwork = { ...mockTaskInput, network: "err" }
    /* @ts-expect-error testing invalid input */
    const err9 = captureZodError(() => new Task(invalidNetwork))
    expect(err9.issues[0]?.path[0]).toBe("network")
    expect(err9.issues[0]?.message).toMatch("Invalid option")

    const invalidExecutor = { ...mockTaskInput, executor: "executor with space" }
    /* @ts-expect-error testing invalid input */
    const err10 = captureZodError(() => new Task(invalidExecutor))
    expect(err10.issues[0]?.path[0]).toBe("executor")
    expect(err10.issues[0]?.message).toBe(
      'Invalid option: expected one of "DcaBot"|"DcaBotFixed"|"HodlBondsTrade"|"UnitTest"',
    )
  })

  it("Task.fromTask: Throws", () => {
    expect.assertions(1)

    const mockTask = new Task(mockTaskInput)
    expect(() => Task.fromTask(mockTask)).toThrow(
      "fromTask() is not implemented in the Task class itself",
    )
  })
})

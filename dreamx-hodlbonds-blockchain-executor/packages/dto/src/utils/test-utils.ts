import { ZodError } from "zod"

import type { MessageParams } from "@/schemas/message-schema"
import type { TaskInput } from "@/schemas/task-schema"

import { Executor, Network, Status } from "@/common"

export function captureError<T>(fn: () => T): unknown {
  try {
    fn()
  } catch (e) {
    return e
  }
  throw new Error("Expected function to throw")
}

export async function captureErrorAsync<T>(fn: () => Promise<T>): Promise<unknown> {
  try {
    await fn()
  } catch (e) {
    return e
  }
  throw new Error("Expected function to throw")
}

export function captureZodError<T>(fn: () => T) {
  const err = captureError(fn)
  if (!(err instanceof ZodError)) {
    throw new Error("Did not receive a ZodError")
  }
  return err
}

export async function captureZodErrorAsync<T>(fn: () => Promise<T>): Promise<ZodError> {
  const err = await captureErrorAsync(fn)
  if (!(err instanceof ZodError)) {
    throw new Error("Did not receive a ZodError")
  }
  return err
}

export const mockMessage: MessageParams = {
  priority: 100,
  earliestTry: 1689167443,
  latestTry: 1691655207,
  shouldRetry: true,
  network: Network.tst,
  executor: Executor.UnitTest,
  data: {},
}

export const mockTaskInput: TaskInput = {
  id: 111,
  status: Status.QUEUED,
  priority: 222,
  earliest_try_unix: 1234567890,
  latest_try_unix: 1234567890,
  should_retry: true,
  attempts: 3,
  next_attempt_unix: 123654098,
  network: Network.tst,
  executor: Executor.UnitTest,
  data: {
    someString: "someValue1",
    someNumber: 2,
  },
}

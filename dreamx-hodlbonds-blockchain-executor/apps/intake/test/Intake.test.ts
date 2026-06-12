import { schema } from "@dreamx-development/hodlbonds-blockchain-executor-database"
import { Status, captureZodErrorAsync } from "@dreamx-development/hodlbonds-blockchain-executor-dto"
import { eq, sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres/driver"
import { reset } from "drizzle-seed"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { getDatabaseProvider } from "@/database/DatabaseProvider"
import { Intake } from "@/Intake"
import { computeHash } from "@/utils/canonical"

import { regularMessage } from "./__testdata__/intake-data"
import {
  makeJsonStringDataMessage,
  makeNonJsonStringDataMessage,
} from "./__testdata__/make-pubsub-message"

// Helper function to spy on all logger methods
function spyOnLogger(intake: Intake) {
  return {
    info: vi.spyOn(intake.logger, "info"),
    warn: vi.spyOn(intake.logger, "warn"),
    error: vi.spyOn(intake.logger, "error"),
  }
}

const task: any = {
  status: Status.QUEUED,
  priority: regularMessage.priority,
  executor: regularMessage.executor,
  earliest_try: new Date(regularMessage.earliestTry * 1000),
  latest_try: new Date((regularMessage.latestTry ?? 0) * 1000),
  should_retry: regularMessage.shouldRetry,
  network: regularMessage.network,
  data: regularMessage.data,
  task_hash: computeHash(regularMessage),
}

const mockMessageId = "443322"
await getDatabaseProvider().initialize()
const db = getDatabaseProvider().getDb()

describe("Intake", () => {
  beforeEach(async () => {
    await reset(db, schema)
    await db.execute(sql`TRUNCATE TABLE queue RESTART IDENTITY;`)
  })

  it("initialize: Successfully initializes database provider", async () => {
    expect.assertions(1)

    const intake = new Intake()
    await intake.initialize()

    expect(intake.databaseProvider.db).not.toBeNull()
  })

  it("initialize: Calls database provider initialize", async () => {
    expect.assertions(1)

    const intake = new Intake()
    const initializeSpy = vi.spyOn(intake.databaseProvider, "initialize")

    await intake.initialize()

    expect(initializeSpy).toHaveBeenCalledOnce()
  })

  it("processMessage: Stores incoming task when data is JSON string", async () => {
    expect.assertions(1)

    const sequenceId = 1

    const intake = new Intake()
    const loggerSpy = spyOnLogger(intake)

    const pubsub = makeJsonStringDataMessage()
    await intake.processMessage(mockMessageId, pubsub)
    expect(loggerSpy.info).toHaveBeenCalledWith(
      `Inserted message ${mockMessageId} a ${task.executor} task into the queue with id ${sequenceId}`,
      { messageId: mockMessageId, task, taskId: sequenceId },
    )
  })

  it("processMessage: Throws on bad input - non-JSON string data", async () => {
    expect.assertions(1)

    const intake = new Intake()

    const pubsub = makeNonJsonStringDataMessage()
    const err = await captureZodErrorAsync(async () => {
      await intake.processMessage(mockMessageId, pubsub)
    })
    expect(err.issues[0]?.path[0]).toBe("data")
  })

  it("processMessage: Stores incoming task from PubSub", async () => {
    expect.assertions(4)

    const sequenceId = 1

    const intake = new Intake()
    const loggerSpy = spyOnLogger(intake)

    const baseTasksInDb = await db.query.queue.findMany({ where: eq(schema.queue.id, sequenceId) })
    expect(baseTasksInDb).toHaveLength(0)

    await intake.processMessage(mockMessageId, { json: regularMessage })
    expect(loggerSpy.info).toHaveBeenCalledWith(
      `Inserted message ${mockMessageId} a ${task.executor} task into the queue with id ${sequenceId}`,
      { messageId: mockMessageId, task, taskId: sequenceId },
    )

    const tasksInDb = await db.query.queue.findMany({ where: eq(schema.queue.id, sequenceId) })
    expect(tasksInDb).toHaveLength(1)
    expect(tasksInDb[0]).toMatchObject({
      id: sequenceId,
      status: Status.QUEUED,
      priority: regularMessage.priority,
      executor: regularMessage.executor,
      earliest_try: new Date(regularMessage.earliestTry * 1000),
      gas_price: null,
      gas_usage: null,
      latest_try: new Date(regularMessage.latestTry! * 1000),
      next_attempt: null,
      previous_attempt_region: null,
      should_retry: regularMessage.shouldRetry,
      network: regularMessage.network,
      data: regularMessage.data,
      task_hash: "34063c6a9287502c7b6bb4b2c2f5be11d400ab99a6ccd8167e49b0707454c3db",
    })
  })

  it("processMessage: Stores task with null latest_try", async () => {
    expect.assertions(2)

    const sequenceId = 1
    const messageWithNullLatestTry = { ...regularMessage, latestTry: null }

    const intake = new Intake()

    await intake.processMessage(mockMessageId, { json: messageWithNullLatestTry })

    const tasksInDb = await db.query.queue.findMany({ where: eq(schema.queue.id, sequenceId) })
    expect(tasksInDb).toHaveLength(1)
    expect(tasksInDb[0]?.latest_try).toBeNull()
  })

  it("processMessage: Throws on bad input - missing fields", async () => {
    expect.assertions(8)

    const intake = new Intake()

    const missingExecutor = { ...regularMessage, executor: undefined }
    const err = await captureZodErrorAsync(async () => {
      await intake.processMessage(mockMessageId, { json: missingExecutor })
    })
    expect(err.issues[0]?.path[0]).toBe("executor")
    expect(err.issues[0]?.message).toMatch("Invalid option")

    const missingPriority = { ...regularMessage, priority: undefined }
    const err2 = await captureZodErrorAsync(async () => {
      await intake.processMessage(mockMessageId, { json: missingPriority })
    })
    expect(err2.issues[0]?.path[0]).toBe("priority")
    expect(err2.issues[0]?.message).toMatch("Invalid input")

    const missingEarliestTry = { ...regularMessage, earliestTry: undefined }
    const err3 = await captureZodErrorAsync(async () => {
      await intake.processMessage(mockMessageId, { json: missingEarliestTry })
    })
    expect(err3.issues[0]?.path[0]).toBe("earliestTry")
    expect(err3.issues[0]?.message).toMatch("Invalid input")

    const missingShouldRetry = { ...regularMessage, shouldRetry: undefined }
    const err4 = await captureZodErrorAsync(async () => {
      await intake.processMessage(mockMessageId, { json: missingShouldRetry })
    })
    expect(err4.issues[0]?.path[0]).toBe("shouldRetry")
    expect(err4.issues[0]?.message).toMatch("Invalid input")
  })

  it("processMessage: Throws on bad input - wrong data", async () => {
    expect.assertions(8)

    const intake = new Intake()

    const missingExecutor = { ...regularMessage, executor: "#invalid input" }
    const err = await captureZodErrorAsync(async () => {
      await intake.processMessage(mockMessageId, { json: missingExecutor })
    })
    expect(err.issues[0]?.path[0]).toBe("executor")
    expect(err.issues[0]?.message).toMatch("Invalid option")

    const missingPriority = { ...regularMessage, priority: "#invalid input" }
    const err2 = await captureZodErrorAsync(async () => {
      await intake.processMessage(mockMessageId, { json: missingPriority })
    })
    expect(err2.issues[0]?.path[0]).toBe("priority")
    expect(err2.issues[0]?.message).toMatch("Invalid input")

    const missingEarliestTry = { ...regularMessage, earliestTry: "#invalid input" }
    const err3 = await captureZodErrorAsync(async () => {
      await intake.processMessage(mockMessageId, { json: missingEarliestTry })
    })
    expect(err3.issues[0]?.path[0]).toBe("earliestTry")
    expect(err3.issues[0]?.message).toMatch("Invalid input")

    const missingShouldRetry = { ...regularMessage, shouldRetry: "#invalid input" }
    const err4 = await captureZodErrorAsync(async () => {
      await intake.processMessage(mockMessageId, { json: missingShouldRetry })
    })
    expect(err4.issues[0]?.path[0]).toBe("shouldRetry")
    expect(err4.issues[0]?.message).toMatch("Invalid input")
  })

  it("processMessage: Drops message on duplicate", async () => {
    expect.assertions(4)

    const sequenceId = 1

    const intake = new Intake()
    const loggerSpy = spyOnLogger(intake)

    const baseTasksInDb = await db.query.queue.findMany({ where: eq(schema.queue.id, sequenceId) })
    expect(baseTasksInDb).toHaveLength(0)

    // Seed DB with initial message
    await intake.processMessage(mockMessageId, { json: regularMessage })
    const tasksInDb = await db.query.queue.findMany({ where: eq(schema.queue.id, sequenceId) })
    expect(tasksInDb).toHaveLength(1)

    // Process duplicate message
    await intake.processMessage(mockMessageId, { json: regularMessage })

    expect(loggerSpy.warn).toHaveBeenCalledWith(
      `Dropping new message ${mockMessageId} ${task.executor} task after finding duplicate. Existing task has id 1 and hash 34063c6a9287502c7b6bb4b2c2f5be11d400ab99a6ccd8167e49b0707454c3db`,
      {
        messageId: mockMessageId,
        task,
        existingTaskId: sequenceId,
        existingTaskHash: task.task_hash,
      },
    )

    const tasksInDb2 = await db.query.queue.findMany({ where: eq(schema.queue.id, sequenceId) })
    expect(tasksInDb2).toHaveLength(1)
  })

  it("processMessage: Throws on db insert and select failure", async () => {
    expect.assertions(1)

    const mockDb = drizzle.mock({ schema })
    const provider = getDatabaseProvider()
    provider.db = mockDb as unknown as typeof provider.db

    const onConflictResult = vi.fn().mockResolvedValue([{ id: null }])
    const returning = vi.fn().mockReturnValue({ onConflictDoNothing: onConflictResult })
    const values = vi.fn().mockReturnValue({ returning })
    const insert = vi.fn().mockReturnValue({ values })
    mockDb.insert = insert

    const where = vi.fn().mockResolvedValue([])
    const from = vi.fn().mockReturnValue({ where })
    const select = vi.fn().mockReturnValue({ from })
    mockDb.select = select

    const intake = new Intake()

    await expect(intake.processMessage(mockMessageId, { json: regularMessage })).rejects.toThrow(
      `Failed to add message ${mockMessageId} UnitTest task to queue, unknown reason.`,
    )
  })

  it("processMessage: Throws on db insert failure", async () => {
    expect.assertions(2)

    const mockDb = drizzle.mock({ schema })
    const provider = getDatabaseProvider()
    provider.db = mockDb as unknown as typeof provider.db

    const insertError = new Error("Database insert error")
    const onConflictResult = vi.fn().mockRejectedValue(insertError)
    const returning = vi.fn().mockReturnValue({ onConflictDoNothing: onConflictResult })
    const values = vi.fn().mockReturnValue({ returning })
    const insert = vi.fn().mockReturnValue({ values })
    mockDb.insert = insert

    const intake = new Intake()
    const loggerSpy = spyOnLogger(intake)

    await expect(intake.processMessage(mockMessageId, { json: regularMessage })).rejects.toThrow(
      `Failed to insert message ${mockMessageId} UnitTest task into the queue table with exception: Error: Database insert error`,
    )

    expect(loggerSpy.error).toHaveBeenCalledWith(
      `Failed to insert message ${mockMessageId} UnitTest task into the queue table with exception: Error: Database insert error`,
      expect.objectContaining({
        messageId: mockMessageId,
        task: expect.any(Object),
      }),
    )
  })

  it("processMessage: Throws on db select for duplicates failure", async () => {
    expect.assertions(2)

    const mockDb = drizzle.mock({ schema })
    const provider = getDatabaseProvider()
    provider.db = mockDb as unknown as typeof provider.db

    // Insert returns no id, indicating a conflict
    const onConflictResult = vi.fn().mockResolvedValue([{ id: undefined }])
    const returning = vi.fn().mockReturnValue({ onConflictDoNothing: onConflictResult })
    const values = vi.fn().mockReturnValue({ returning })
    const insert = vi.fn().mockReturnValue({ values })
    mockDb.insert = insert

    // Select fails with an error
    const selectError = new Error("Database select error")
    const where = vi.fn().mockRejectedValue(selectError)
    const from = vi.fn().mockReturnValue({ where })
    const select = vi.fn().mockReturnValue({ from })
    mockDb.select = select

    const intake = new Intake()
    const loggerSpy = spyOnLogger(intake)

    await expect(intake.processMessage(mockMessageId, { json: regularMessage })).rejects.toThrow(
      `Failed to select for duplicates for message ${mockMessageId} UnitTest task exception: Error: Database select error`,
    )

    expect(loggerSpy.error).toHaveBeenCalledWith(
      `Failed to select for duplicates for message ${mockMessageId} UnitTest task exception: Error: Database select error`,
      expect.objectContaining({
        messageId: mockMessageId,
        task: expect.any(Object),
      }),
    )
  })
})

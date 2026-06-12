// oxlint-disable no-new
// oxlint-disable jest/no-conditional-in-test
import type { TaskInput } from "@dreamx-development/hodlbonds-blockchain-executor-dto"
import type { Signer } from "ethers"

import { schema } from "@dreamx-development/hodlbonds-blockchain-executor-database"
import {
  captureZodError,
  Executor,
  Network,
  Status,
  Task,
} from "@dreamx-development/hodlbonds-blockchain-executor-dto"
import { eq, sql, DrizzleQueryError } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import crypto from "node:crypto"
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest"

import type { ExecutionResult } from "@/ExecutionResult"
import type { ExecutorAbstract } from "@/ExecutorAbstract"
import type { ExecutorFactory } from "@/ExecutorFactory"
import type { ExecutionManagerConfig, ExecutorConfig } from "@/schemas"
import type { Wallet } from "@/Wallet"
import type { WalletManager } from "@/WalletManager"

import { baseConfig } from "@/config"
import { getDatabaseProvider } from "@/database/DatabaseProvider"
import { ExecutionManager } from "@/ExecutionManager"
import { ExecutorRegion } from "@/schemas"
import * as sleepModule from "@/utils/SleepAndTimeout"

const db = getDatabaseProvider().getDb()

const mockExecutorConfig: ExecutorConfig = {
  minimumGasPrice: "10",
  maximumPriorityFeePerGas: "5",
  overBidPercent: 125,
}

const mockConfig = {
  executorRegion: ExecutorRegion.US1,
  network: Network.tst,
  processQueueDelay: 10000,
  defaultRetryDeadline: "1h",
  regionRetryBlockDeadline: "25s",
  baseRetryInterval: 2,
  maxRetryInterval: 3600,
  executorConfig: mockExecutorConfig,
} satisfies ExecutionManagerConfig

// Helper function to spy on all logger methods
function spyOnLogger(manager: ExecutionManager) {
  return {
    debug: vi.spyOn(manager.logger, "debug"),
    info: vi.spyOn(manager.logger, "info"),
    warn: vi.spyOn(manager.logger, "warn"),
    error: vi.spyOn(manager.logger, "error"),
  }
}

const nowUnix = Math.floor(Date.now() / 1000)
const recentPastUnix = nowUnix - 1800 // 30 minutes ago

const initialTable: TaskQueueItem[] = [
  createDatabaseQueueItem({
    id: 1,
    status: Status.QUEUED,
    priority: 100,
    earliest_try_unix: recentPastUnix,
    latest_try_unix: null,
    should_retry: true,
    attempts: 0,
    next_attempt_unix: 0,
    previous_attempt_region: ExecutorRegion.US1,
    network: Network.tst,
    executor: Executor.UnitTest,
    data: { param1: 1, param2: "ABC" },
  }),
  createDatabaseQueueItem({
    id: 2,
    status: Status.ERROR_RETRY,
    priority: 200,
    earliest_try_unix: recentPastUnix,
    latest_try_unix: null,
    should_retry: true,
    attempts: 4,
    next_attempt_unix: 0,
    previous_attempt_region: ExecutorRegion.US1,
    network: Network.tst,
    executor: Executor.UnitTest,
    data: { param1: 2, param2: "DEF" },
  }),
]

const expandedTable = [
  ...initialTable,
  createDatabaseQueueItem({
    id: 3,
    status: Status.QUEUED,
    priority: 200,
    earliest_try_unix: recentPastUnix,
    latest_try_unix: null,
    should_retry: false,
    attempts: 0,
    next_attempt_unix: 0,
    previous_attempt_region: ExecutorRegion.US1,
    network: Network.tst,
    executor: Executor.UnitTest,
    data: { param1: 3, param2: "DEF" },
  }),
  createDatabaseQueueItem({
    id: 4,
    status: Status.ERROR_RETRY,
    priority: 200,
    earliest_try_unix: recentPastUnix,
    latest_try_unix: null,
    should_retry: false,
    attempts: 2,
    next_attempt_unix: 0,
    previous_attempt_region: ExecutorRegion.US1,
    network: Network.tst,
    executor: Executor.UnitTest,
    data: { param1: 4, param2: "DEF" },
  }),
  createDatabaseQueueItem({
    id: 5,
    status: Status.ERROR_RETRY,
    priority: 200,
    earliest_try_unix: recentPastUnix,
    latest_try_unix: null,
    should_retry: false,
    attempts: 3,
    next_attempt_unix: 0,
    previous_attempt_region: ExecutorRegion.US1,
    network: Network.tst,
    executor: Executor.UnitTest,
    data: { param1: 5, param2: "DEF" },
  }),
  createDatabaseQueueItem({
    id: 6,
    status: Status.ERROR_RETRY,
    priority: 200,
    earliest_try_unix: recentPastUnix,
    latest_try_unix: null,
    should_retry: false,
    attempts: 4,
    next_attempt_unix: 0,
    previous_attempt_region: ExecutorRegion.US1,
    network: Network.tst,
    executor: Executor.UnitTest,
    data: { param1: 6, param2: "DEF" },
  }),
  createDatabaseQueueItem({
    id: 7,
    status: Status.QUEUED,
    priority: 200,
    earliest_try_unix: recentPastUnix,
    latest_try_unix: null,
    should_retry: false,
    attempts: 0,
    next_attempt_unix: 0,
    previous_attempt_region: ExecutorRegion.US1,
    network: Network.tst,
    executor: Executor.UnitTest,
    data: { param1: 7, param2: "DEF" },
  }),
  createDatabaseQueueItem({
    id: 8,
    status: Status.QUEUED,
    priority: 200,
    earliest_try_unix: recentPastUnix,
    latest_try_unix: null,
    should_retry: false,
    attempts: 0,
    next_attempt_unix: 0,
    previous_attempt_region: ExecutorRegion.US1,
    network: Network.tst,
    executor: Executor.UnitTest,
    data: { param1: 8, param2: "DEF" },
  }),
]

const mockWallets = initialTable.map((_, idx) => `Wallet ${idx}` as unknown as Wallet)
const mockQueue = initialTable.map((task) => new Task(task))

const mockWalletManagerGetAvailableWalletCount = vi.fn()
const mockWalletManagerGetMerkleTreeManager = vi.fn()
const mockWalletManagerRequestWalletNotNull = vi.fn()
const mockWalletManagerRequestNewProviderConnection = vi.fn()
const mockWalletManager = {
  config: { chainId: 4488 },
  getAvailableWalletCount: mockWalletManagerGetAvailableWalletCount,
  getMerkleTreeManager: mockWalletManagerGetMerkleTreeManager,
  requestWalletNotNull: mockWalletManagerRequestWalletNotNull,
  requestNewProviderConnection: mockWalletManagerRequestNewProviderConnection,
  releaseWallet: vi.fn(),
} as unknown as WalletManager

const mockExecutorExecute = vi.fn()
const mockExecutorFactoryGetExecutor = vi.fn()
const mockExecutorFactory = {
  getExecutor: mockExecutorFactoryGetExecutor,
} as unknown as ExecutorFactory

/**
 *
 * @param {Task} task
 * @param {string[]} txHashes
 * @param {string} message
 * @return {ExecutionResult}
 */
function createMockResult(task: Task, txHashes: string[], message: string): ExecutionResult {
  return {
    task,
    gasPrice: null,
    gasUsage: null,
    getTxHashes: () => txHashes,
    getMessage: () => message,
  } as unknown as ExecutionResult
}

describe("Executor Manager tests", () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    vi.useFakeTimers()

    mockWalletManagerGetAvailableWalletCount.mockReturnValue(mockWallets.length)
    mockWalletManagerRequestWalletNotNull
      .mockReturnValueOnce(mockWallets[0])
      .mockReturnValueOnce(mockWallets[1])
    mockExecutorFactoryGetExecutor.mockReturnValue({
      execute: (task: Task, signer: Signer) => mockExecutorExecute(task, signer),
    } as unknown as ExecutorAbstract)

    await db.execute(sql`TRUNCATE TABLE queue RESTART IDENTITY;`)
    await db.execute(sql`TRUNCATE TABLE queue_log RESTART IDENTITY;`)
  })

  afterEach(() => {
    vi.clearAllTimers()
  })

  it("Constructor: Happy path", () => {
    expect.assertions(4)

    const manager = new ExecutionManager(mockConfig, mockWalletManager)

    expect(manager.constructor.name).toBe("ExecutionManager")
    expect(manager.network).toBe(mockConfig.network)
    expect(manager.config).toEqual(mockConfig)
    expect(manager.walletManager).toBe(mockWalletManager)
  })

  it("Constructor: Throws on invalid or missing config options", () => {
    const configFields = Object.keys(mockConfig).filter((it) => !["executorConfig"].includes(it))
    expect.assertions(2 * configFields.length + 4)

    for (const fieldName of configFields) {
      const mockConfigBad = {
        ...mockConfig,
        [fieldName]: "#invalid",
      } as ExecutionManagerConfig

      const err = captureZodError(() => {
        new ExecutionManager(mockConfigBad, mockWalletManager)
      })
      expect(err.issues[0]?.path[0]).toBe(fieldName)

      const mockConfigMissing = {
        ...mockConfig,
        [fieldName]: undefined,
      } as ExecutionManagerConfig

      const err2 = captureZodError(() => {
        new ExecutionManager(mockConfigMissing, mockWalletManager)
      })
      expect(err2.issues[0]?.path[0]).toBe(fieldName)
    }

    const err = captureZodError(() => {
      new ExecutionManager(
        {
          ...mockConfig,
          executorConfig: { ...mockExecutorConfig, maximumPriorityFeePerGas: "#invalid" },
        },
        mockWalletManager,
      )
    })
    expect(err.issues[0]?.code).toBe("invalid_format")
    expect(err.issues[0]?.path[1]).toBe("maximumPriorityFeePerGas")

    const err2 = captureZodError(() => {
      new ExecutionManager(
        { ...mockConfig, executorConfig: undefined as unknown as ExecutorConfig },
        mockWalletManager,
      )
    })
    expect(err2.issues[0]?.code).toBe("invalid_type")
    expect(err2.issues[0]?.path[0]).toBe("executorConfig")
  })

  it("start: Starts the proper functions in correct order", async () => {
    expect.assertions(2)

    const manager = new ExecutionManager(mockConfig, mockWalletManager)
    const loggerSpy = spyOnLogger(manager)
    manager.processQueue = vi.fn().mockResolvedValue(null)

    await manager.start()

    expect(loggerSpy.info).toHaveBeenCalledWith("Starting ExecutionManager", {
      chainId: 4488,
      network: "tst",
      region: "US1",
    })
    expect(manager.processQueue).toHaveBeenCalledOnce()
  })

  it("executeTask: Throws error if executorFactory not initialized", async () => {
    expect.assertions(1)

    const task = new Task(initialTable[0]!)
    const wallet = mockWallets[0]!

    const manager = new ExecutionManager(mockConfig, mockWalletManager)
    // Don't call start(), so executorFactory remains null

    await expect(manager.executeTask(task, wallet)).rejects.toThrow(
      "ExecutorFactory not initialized. Call start() before processing tasks.",
    )
  })

  it("getQueue: Skips logic if limit = 0", async () => {
    expect.assertions(2)

    const manager = new ExecutionManager(mockConfig, mockWalletManager)
    manager.getQueueOfType = vi.fn()

    const result = await manager.getQueue(0)

    expect(result).toStrictEqual([])
    expect(manager.getQueueOfType).not.toBeCalled()
  })

  it("getQueue: Returns the current queue", async () => {
    expect.assertions(1)

    const expectedQueue = [
      expandedTable[0],
      expandedTable[2],
      expandedTable[6],
      expandedTable[1],
      expandedTable[3],
      expandedTable[7],
    ]
      .filter((t): t is NonNullable<TaskQueueItem> => !!t)
      .map((task) => new Task(task))

    // Seed db with entries
    await db
      .insert(schema.queue)
      .values([
        expandedTable[0]!,
        expandedTable[2]!,
        expandedTable[6]!,
        expandedTable[1]!,
        expandedTable[3]!,
        expandedTable[7]!,
      ])

    const manager = new ExecutionManager(mockConfig, mockWalletManager)
    const queue = await manager.getQueue(6)

    expect(queue).toStrictEqual(expectedQueue)
  })

  it("getQueue: SQL query regression check", async () => {
    expect.assertions(1)

    const queries: string[] = []
    const customLogger = {
      logQuery(query: string, _params: unknown[]) {
        queries.push(query)
      },
    }

    const loggedDb = drizzle({
      connection: baseConfig.DATABASE_URL,
      schema,
      logger: customLogger,
    })

    await loggedDb
      .insert(schema.queue)
      .values([
        expandedTable[0]!,
        expandedTable[2]!,
        expandedTable[6]!,
        expandedTable[1]!,
        expandedTable[3]!,
        expandedTable[7]!,
      ])

    queries.length = 0 // Reset after seeding

    const manager = new ExecutionManager(mockConfig, mockWalletManager)
    manager.databaseProvider.db = loggedDb

    await manager.getQueue(6)

    // Filter to only transaction-related queries
    const relevantQueries = queries.filter(
      (q) => q.includes("queue") || q.includes("TRANSACTION") || q.includes("SERIALIZABLE"),
    )
    expect(relevantQueries).toMatchSnapshot()
  })

  it("getQueue: Respects executor region retry blocking for ERROR_RETRY tasks", async () => {
    expect.assertions(4)

    const nowUnixForTest = Math.floor(Date.now() / 1000)

    // Task 1: ERROR_RETRY from same region (US1), next_attempt ready but block still active
    // Block condition: previous_attempt_region != 'US1' OR next_attempt + 25s < now
    // Since region IS US1 AND next_attempt + 25s > now, this is BLOCKED
    const sameRegionTask = createDatabaseQueueItem({
      id: 100,
      status: Status.ERROR_RETRY,
      priority: 100,
      earliest_try_unix: nowUnixForTest - 60, // 1 minute ago (within 1h deadline)
      latest_try_unix: null,
      should_retry: true,
      attempts: 1,
      next_attempt_unix: nowUnixForTest - 10, // Ready to retry (in the past)
      previous_attempt_region: ExecutorRegion.US1, // Same region
      network: Network.tst,
      executor: Executor.UnitTest,
      data: { test: "same_region" },
    })

    // Task 2: ERROR_RETRY from different region (EU1)
    // Block condition satisfied: previous_attempt_region != 'US1' (TRUE, so ALLOWED)
    const differentRegionTask = createDatabaseQueueItem({
      id: 101,
      status: Status.ERROR_RETRY,
      priority: 100,
      earliest_try_unix: nowUnixForTest - 60, // 1 minute ago (within 1h deadline)
      latest_try_unix: null,
      should_retry: true,
      attempts: 1,
      next_attempt_unix: nowUnixForTest - 10, // Ready to retry
      previous_attempt_region: ExecutorRegion.EU1, // Different region
      network: Network.tst,
      executor: Executor.UnitTest,
      data: { test: "different_region" },
    })

    // Task 3: ERROR_RETRY from same region but block expired
    // Block condition satisfied: next_attempt + 25s < now (TRUE, so ALLOWED)
    const expiredBlockTask = createDatabaseQueueItem({
      id: 102,
      status: Status.ERROR_RETRY,
      priority: 100,
      earliest_try_unix: nowUnixForTest - 60, // 1 minute ago (within 1h deadline)
      latest_try_unix: null,
      should_retry: true,
      attempts: 1,
      next_attempt_unix: nowUnixForTest - 30, // 30s ago, block expired (30 > 25)
      previous_attempt_region: ExecutorRegion.US1, // Same region but old enough
      network: Network.tst,
      executor: Executor.UnitTest,
      data: { test: "expired_block" },
    })

    await db.insert(schema.queue).values([sameRegionTask, differentRegionTask, expiredBlockTask])

    const manager = new ExecutionManager(mockConfig, mockWalletManager)
    const queue = await manager.getQueue(10)

    // Should get task 2 (different region) and task 3 (expired block)
    // Should NOT get task 1 (same region, block still active)
    expect(queue.length).toBe(2)
    expect(queue.find((t) => t.id === 101)).toBeDefined() // Different region
    expect(queue.find((t) => t.id === 102)).toBeDefined() // Expired block
    expect(queue.find((t) => t.id === 100)).toBeUndefined() // Same region blocked
  })

  it("getQueue: Excludes task when latest_try is null and earliest_try is outside the defaultRetryDeadline window", async () => {
    expect.assertions(1)

    const nowUnixForTest = Math.floor(Date.now() / 1000)

    // latest_try is null, but earliest_try was 2 hours ago — outside the "1h" window
    const expiredTask = createDatabaseQueueItem({
      id: 200,
      status: Status.QUEUED,
      priority: 100,
      earliest_try_unix: nowUnixForTest - 7200, // 2 hours ago, outside 1h deadline
      latest_try_unix: null,
      should_retry: false,
      attempts: 0,
      next_attempt_unix: nowUnixForTest - 7200,
      previous_attempt_region: null,
      network: Network.tst,
      executor: Executor.UnitTest,
      data: { test: "expired_deadline" },
    })

    await db.insert(schema.queue).values([expiredTask])

    const manager = new ExecutionManager(mockConfig, mockWalletManager)
    const queue = await manager.getQueue(10)

    expect(queue.find((t) => t.id === 200)).toBeUndefined()
  })

  it("getQueue: Includes task when latest_try is non-null and in the future", async () => {
    expect.assertions(1)

    const nowUnixForTest = Math.floor(Date.now() / 1000)

    // earliest_try was 2 hours ago (outside defaultRetryDeadline window), but latest_try is still
    // in the future — the OR branch should allow this task through
    const futureLatestTryTask = createDatabaseQueueItem({
      id: 201,
      status: Status.QUEUED,
      priority: 100,
      earliest_try_unix: nowUnixForTest - 7200, // 2 hours ago, outside 1h deadline
      latest_try_unix: nowUnixForTest + 3600, // 1 hour from now
      should_retry: false,
      attempts: 0,
      next_attempt_unix: nowUnixForTest - 7200,
      previous_attempt_region: null,
      network: Network.tst,
      executor: Executor.UnitTest,
      data: { test: "future_latest_try" },
    })

    await db.insert(schema.queue).values([futureLatestTryTask])

    const manager = new ExecutionManager(mockConfig, mockWalletManager)
    const queue = await manager.getQueue(10)

    expect(queue.find((t) => t.id === 201)).toBeDefined()
  })

  it("getQueue: Excludes task when latest_try is non-null and in the past", async () => {
    expect.assertions(1)

    const nowUnixForTest = Math.floor(Date.now() / 1000)

    // Both conditions fail: earliest_try outside the deadline window AND latest_try in the past
    const pastLatestTryTask = createDatabaseQueueItem({
      id: 202,
      status: Status.QUEUED,
      priority: 100,
      earliest_try_unix: nowUnixForTest - 7200, // 2 hours ago, outside 1h deadline
      latest_try_unix: nowUnixForTest - 60, // 1 minute ago — past deadline
      should_retry: false,
      attempts: 0,
      next_attempt_unix: nowUnixForTest - 7200,
      previous_attempt_region: null,
      network: Network.tst,
      executor: Executor.UnitTest,
      data: { test: "past_latest_try" },
    })

    await db.insert(schema.queue).values([pastLatestTryTask])

    const manager = new ExecutionManager(mockConfig, mockWalletManager)
    const queue = await manager.getQueue(10)

    expect(queue.find((t) => t.id === 202)).toBeUndefined()
  })

  it("getQueue: Different limit combinations", async () => {
    expect.assertions(7)

    let call = 1
    const mockGetQueueOfType = vi.fn()

    const manager = new ExecutionManager(mockConfig, mockWalletManager)
    manager.getQueueOfType = mockGetQueueOfType

    // First 3 QUEUED and 2 RETRY
    mockGetQueueOfType
      .mockReturnValueOnce([expandedTable[0], expandedTable[2], expandedTable[7]])
      .mockReturnValueOnce([expandedTable[0], expandedTable[2]])

    await manager.getQueue(5)
    expect(manager.getQueueOfType).nthCalledWith(call++, Status.QUEUED, 3, expect.anything())
    expect(manager.getQueueOfType).nthCalledWith(call++, Status.ERROR_RETRY, 2, expect.anything())

    // Not filling the QUEUED limit, room for more ERROR_RETRY
    mockGetQueueOfType
      .mockReturnValueOnce([])
      .mockReturnValueOnce([
        expandedTable[0],
        expandedTable[2],
        expandedTable[4],
        expandedTable[5],
        expandedTable[6],
      ])

    await manager.getQueue(5)
    expect(manager.getQueueOfType).nthCalledWith(call++, Status.QUEUED, 3, expect.anything())
    expect(manager.getQueueOfType).nthCalledWith(call++, Status.ERROR_RETRY, 5, expect.anything())

    // Filling QUEUE, then no RETRY, so room for more QUEUED
    mockGetQueueOfType
      .mockReturnValueOnce([expandedTable[0], expandedTable[2], expandedTable[7]])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([expandedTable[1]])

    await manager.getQueue(5)
    expect(manager.getQueueOfType).nthCalledWith(call++, Status.QUEUED, 3, expect.anything())
    expect(manager.getQueueOfType).nthCalledWith(call++, Status.ERROR_RETRY, 2, expect.anything())
    expect(manager.getQueueOfType).nthCalledWith(call++, Status.QUEUED, 2, expect.anything(), [
      expandedTable[0]?.id,
      expandedTable[2]?.id,
      expandedTable[7]?.id,
    ])
  })

  it("getQueue: Logs and rollbacks on exception", async () => {
    expect.assertions(5)

    const mockError = new Error("Some error occurred in select")

    // Seed database with a task that should be marked as EXECUTING
    await db.insert(schema.queue).values(initialTable[0]!)

    const manager = new ExecutionManager(mockConfig, mockWalletManager)
    const loggerSpy = spyOnLogger(manager)

    // Throw error inside transaction to trigger rollback
    manager.unitTestStub = vi.fn().mockImplementation(() => {
      throw mockError
    })

    // Verify the error is caught, logged, and re-thrown
    await expect(manager.getQueue(10)).rejects.toThrow(
      `Got error while trying to get queue: ${mockError.message}`,
    )

    expect(loggerSpy.error).toBeCalledWith(
      `Got error while trying to get queue: ${mockError.message}`,
      mockError,
    )

    // Verify unitTestStub was called (proving we entered the transaction)
    expect(manager.unitTestStub).toHaveBeenCalledOnce()

    // Verify database state was NOT modified (implicit rollback verification)
    // The task should still be QUEUED, not EXECUTING
    const task = await db.query.queue.findFirst({
      where: eq(schema.queue.id, initialTable[0]!.id),
    })
    expect(task?.status).toBe(Status.QUEUED)
    expect(task?.id).toBe(initialTable[0]!.id)
  })

  it("getQueue: Handles concurrent update errors with graceful retry", async () => {
    vi.useRealTimers()
    expect.assertions(5)
    const sleepSpy = vi.spyOn(sleepModule, "sleep")

    // Seed database with a task
    await db.insert(schema.queue).values(initialTable[0]!)

    const manager = new ExecutionManager(mockConfig, mockWalletManager)
    const loggerSpy = spyOnLogger(manager)

    // Simulate PostgreSQL serialization error with proper DrizzleQueryError
    const postgresError = new Error("could not serialize access due to concurrent update")
    const drizzleError = new DrizzleQueryError(
      'update "queue" set "status" = $1 where "queue"."id" in ($2)',
      ["EXECUTING", 1],
      postgresError,
    )

    manager.unitTestStub = vi.fn().mockImplementation(() => {
      throw drizzleError
    })

    // Should return empty array (not throw) - graceful degradation
    const result = await manager.getQueue(10)

    expect(result).toStrictEqual([])
    expect(loggerSpy.warn).toHaveBeenCalledWith("getQueue(): Rollback due to concurrent update")
    expect(sleepSpy).toHaveBeenCalledWith(100)

    // Verify task is still in original state (rollback successful)
    const task = await db.query.queue.findFirst({
      where: eq(schema.queue.id, initialTable[0]!.id),
    })
    expect(task?.status).toBe(Status.QUEUED)
    expect(task?.id).toBe(initialTable[0]!.id)
  })

  it("getQueue: Handles read-write dependency errors with graceful retry", async () => {
    vi.useRealTimers()
    expect.assertions(5)
    const sleepSpy = vi.spyOn(sleepModule, "sleep").mockImplementation(async () => {})

    // Seed database with a task
    await db.insert(schema.queue).values(initialTable[0]!)

    const manager = new ExecutionManager(mockConfig, mockWalletManager)
    const loggerSpy = spyOnLogger(manager)

    // Simulate PostgreSQL read-write dependency error with proper DrizzleQueryError
    const postgresError = new Error(
      "could not serialize access due to read/write dependencies among transactions",
    )
    const drizzleError = new DrizzleQueryError(
      'update "queue" set "status" = $1 where "queue"."id" in ($2)',
      ["EXECUTING", 1],
      postgresError,
    )

    manager.unitTestStub = vi.fn().mockImplementation(() => {
      throw drizzleError
    })

    // Should return empty array (not throw) - graceful degradation
    const result = await manager.getQueue(10)

    expect(result).toStrictEqual([])
    expect(loggerSpy.warn).toHaveBeenCalledWith("getQueue(): Rollback due to concurrent update")
    expect(sleepSpy).toHaveBeenCalledWith(100)

    // Verify task is still in original state (rollback successful)
    const task = await db.query.queue.findFirst({
      where: eq(schema.queue.id, initialTable[0]!.id),
    })
    expect(task?.status).toBe(Status.QUEUED)
    expect(task?.id).toBe(initialTable[0]!.id)
  })

  it("getQueue: Concurrency test - two managers racing for same task", async () => {
    vi.spyOn(sleepModule, "sleep").mockImplementation(async () => {})

    const freshTask = createDatabaseQueueItem({
      id: 999,
      status: Status.QUEUED,
      priority: 100,
      earliest_try_unix: recentPastUnix,
      latest_try_unix: null,
      should_retry: true,
      attempts: 0,
      next_attempt_unix: 0,
      previous_attempt_region: null,
      network: Network.tst,
      executor: Executor.UnitTest,
      data: { concurrency: "test" },
    })

    // Seed database with the fresh task
    await db.insert(schema.queue).values(freshTask)

    // Create two separate managers with their own logger spies and different regions
    const config1 = { ...mockConfig, executorRegion: ExecutorRegion.US1 }
    const config2 = { ...mockConfig, executorRegion: ExecutorRegion.EU1 }

    const manager1 = new ExecutionManager(config1, mockWalletManager)
    const logger1Spy = spyOnLogger(manager1)
    const manager2 = new ExecutionManager(config2, mockWalletManager)
    const logger2Spy = spyOnLogger(manager2)

    // Run both getQueue calls simultaneously to create a real race condition
    const [result1, result2] = await Promise.all([manager1.getQueue(1), manager2.getQueue(1)])

    // Determine winner and loser
    const winner =
      result1.length > 0
        ? { manager: manager1, result: result1, logger: logger1Spy }
        : { manager: manager2, result: result2, logger: logger2Spy }
    const loser =
      result1.length === 0
        ? { manager: manager1, result: result1, logger: logger1Spy }
        : { manager: manager2, result: result2, logger: logger2Spy }

    // Verify one won and one lost
    expect(winner.result.length).toBe(1)
    expect(loser.result.length).toBe(0)
    expect(winner.result[0]!.id).toBe(freshTask.id)

    // Verify the task is in EXECUTING state (claimed by winner)
    const task = await db.query.queue.findFirst({
      where: eq(schema.queue.id, freshTask.id),
    })
    expect(task?.status).toBe(Status.EXECUTING)
    expect(task?.id).toBe(freshTask.id)

    // The loser can hit the concurrency error in two ways:
    // 1. Postgres serialization error (both try to UPDATE, one fails) - logs warning
    // 2. Winner finishes first, loser's SELECT returns empty - no UPDATE, no error, no log
    expect(winner.logger.warn).not.toHaveBeenCalled()

    // If the loser DID log, verify it's the correct message
    if (loser.logger.warn.mock.calls.length > 0) {
      // oxlint-disable-next-line jest/no-conditional-expect
      expect(loser.logger.warn).toHaveBeenCalledWith(
        "getQueue(): Rollback due to concurrent update",
      )
    }
  })

  it("processQueue: Happy path", async () => {
    expect.assertions(4 + 2 * initialTable.length)

    const wallets = initialTable.map((_, idx) => `Wallet ${idx}` as unknown as Wallet)
    const queue = initialTable.map((task) => new Task(task))

    const executionManager = new ExecutionManager(mockConfig, mockWalletManager)
    executionManager.shutdownInProgress = true
    executionManager.getQueue = vi.fn().mockReturnValue(queue)
    executionManager.executeTask = vi.fn().mockResolvedValue(null)

    vi.spyOn(executionManager, "getQueue")
    await executionManager.processQueue()

    expect(executionManager.walletManager.getAvailableWalletCount).toHaveBeenCalledOnce()
    expect(executionManager.getQueue).toHaveBeenCalledExactlyOnceWith(wallets.length)

    initialTable.forEach((_, idx) => {
      expect(executionManager.executeTask).toHaveBeenNthCalledWith(
        idx + 1,
        queue[idx],
        wallets[idx],
      )
      expect(executionManager.walletManager.releaseWallet).toHaveBeenNthCalledWith(
        idx + 1,
        wallets[idx],
      )
    })
    expect(executionManager.executeTask).toHaveBeenCalledTimes(wallets.length)
    expect(executionManager.tasksBeingProcessed.isEmpty()).toBe(true)
  })

  it("processQueue: Handles executeTask throwing", async () => {
    expect.assertions(5 + 3 * initialTable.length)

    const executionManager = new ExecutionManager(mockConfig, mockWalletManager)
    const loggerSpy = spyOnLogger(executionManager)
    executionManager.shutdownInProgress = true
    executionManager.getQueue = vi.fn().mockReturnValue(mockQueue)

    const error = new Error("Some error!")
    executionManager.executeTask = vi.fn().mockRejectedValue(error)

    vi.spyOn(executionManager, "getQueue")
    await executionManager.processQueue()

    expect(executionManager.walletManager.getAvailableWalletCount).toHaveBeenCalledOnce()
    expect(executionManager.getQueue).toHaveBeenCalledExactlyOnceWith(mockWallets.length)
    initialTable.forEach((_, idx) => {
      expect(executionManager.executeTask).toHaveBeenNthCalledWith(
        idx + 1,
        mockQueue[idx],
        mockWallets[idx],
      )
      expect(executionManager.walletManager.releaseWallet).toHaveBeenNthCalledWith(
        idx + 1,
        mockWallets[idx],
      )
      expect(loggerSpy.error).toHaveBeenNthCalledWith(
        idx + 1,
        `Got exception in processQueue for ${mockQueue[idx]?.executor} Task ${mockQueue[idx]?.id}: Error: ${error.message}`,
        {
          executor: "UnitTest",
          taskId: idx + 1,
        },
      )
    })
    expect(executionManager.executeTask).toHaveBeenCalledTimes(mockWallets.length)
    expect(executionManager.tasksBeingProcessed.isEmpty()).toBe(true)
    expect(loggerSpy.error).toHaveBeenCalledTimes(mockWallets.length)
  })

  it("processQueue: Catches and logs exception from elsewhere", async () => {
    expect.assertions(5)

    const mockError = new Error("getQueue() threw")

    const executionManager = new ExecutionManager(mockConfig, mockWalletManager)
    const loggerSpy = spyOnLogger(executionManager)
    executionManager.getQueue = vi.fn().mockImplementation(() => {
      throw mockError
    })

    const spyOnSetTimeout = vi.spyOn(global, "setTimeout")

    await executionManager.processQueue()

    expect(executionManager.walletManager.getAvailableWalletCount).toBeCalledTimes(1)
    expect(executionManager.getQueue).toBeCalledTimes(1)
    expect(executionManager.getQueue).toBeCalledWith(mockWallets.length)
    expect(loggerSpy.error).toHaveBeenCalledWith(
      `Got error in processQueue(): ${mockError.message}`,
    )
    expect(spyOnSetTimeout).toBeCalled()
  })

  it("processQueue: Initiating the timer for the next run, but not on shutdown", async () => {
    vi.useFakeTimers()
    expect.assertions(11)

    const executionManager = new ExecutionManager(mockConfig, mockWalletManager)
    const loggerSpy = spyOnLogger(executionManager)
    executionManager.getQueue = vi.fn().mockResolvedValue([])

    const spySetTimeout = vi.spyOn(global, "setTimeout")
    const spyClearTimeout = vi.spyOn(global, "clearTimeout")

    expect(executionManager.shutdownInProgress).toBe(false)
    expect(loggerSpy.info).toBeCalledTimes(0)

    await executionManager.processQueue()

    expect(executionManager.shutdownInProgress).toBe(false)
    expect(spySetTimeout).toBeCalledTimes(1)
    expect(spySetTimeout).nthCalledWith(1, expect.any(Function), mockConfig.processQueueDelay)

    await vi.runOnlyPendingTimersAsync()

    expect(spySetTimeout).toBeCalledTimes(2)
    expect(spySetTimeout).nthCalledWith(2, expect.any(Function), mockConfig.processQueueDelay)

    const shutdownPromise = executionManager.shutdown()

    await vi.runOnlyPendingTimersAsync()

    expect(spySetTimeout).toBeCalledTimes(2)
    expect(spyClearTimeout).toBeCalledTimes(1)
    expect(spyClearTimeout).toBeCalledWith(executionManager.timerProcessQueue)
    await expect(shutdownPromise).resolves.toBe(undefined)
  })

  it("executeTask: Happy path", async () => {
    expect.assertions(5)

    const mockResult = {
      isSuccess: () => true,
    } as unknown as ExecutionResult

    mockExecutorExecute.mockReturnValue(mockResult)

    const executionManager = new ExecutionManager(mockConfig, mockWalletManager)
    executionManager.executorFactory = mockExecutorFactory
    executionManager.logSuccess = vi.fn()
    executionManager.logFailure = vi.fn()
    executionManager.logException = vi.fn()

    const mockWallet = {
      signer: "Signer A" as unknown as Signer,
    } as unknown as Wallet

    await executionManager.executeTask(mockQueue[0]!, mockWallet)

    expect(mockExecutorFactory.getExecutor).toHaveBeenCalledExactlyOnceWith(
      mockQueue[0]?.executor,
      mockExecutorConfig,
    )
    expect(mockExecutorExecute).toHaveBeenCalledExactlyOnceWith(mockQueue[0], mockWallet.signer)

    const executorInstance = mockExecutorFactory.getExecutor(
      mockQueue[0]!.executor,
      mockExecutorConfig,
    )
    expect(executionManager.logSuccess).toHaveBeenCalledExactlyOnceWith(
      mockResult,
      executorInstance,
    )
    expect(executionManager.logFailure).toHaveBeenCalledTimes(0)
    expect(executionManager.logException).toHaveBeenCalledTimes(0)
  })

  it("executeTask: Execution fails", async () => {
    expect.assertions(5)

    const mockResult = {
      isSuccess: () => false,
    } as unknown as ExecutionResult

    mockExecutorExecute.mockReturnValue(mockResult)

    const executionManager = new ExecutionManager(mockConfig, mockWalletManager)
    executionManager.executorFactory = mockExecutorFactory
    executionManager.logSuccess = vi.fn()
    executionManager.logFailure = vi.fn()
    executionManager.logException = vi.fn()

    const mockWallet = {
      signer: "Signer A" as unknown as Signer,
    } as unknown as Wallet

    await executionManager.executeTask(mockQueue[0]!, mockWallet)

    expect(mockExecutorFactory.getExecutor).toHaveBeenCalledExactlyOnceWith(
      mockQueue[0]?.executor,
      mockExecutorConfig,
    )
    expect(mockExecutorExecute).toHaveBeenCalledExactlyOnceWith(mockQueue[0], mockWallet.signer)

    const executorInstance = mockExecutorFactory.getExecutor(
      mockQueue[0]!.executor,
      mockExecutorConfig,
    )
    expect(executionManager.logFailure).toHaveBeenCalledExactlyOnceWith(
      mockResult,
      executorInstance,
    )
    expect(executionManager.logSuccess).toHaveBeenCalledTimes(0)
    expect(executionManager.logException).toHaveBeenCalledTimes(0)
  })

  it("executeTask: Execution throws", async () => {
    expect.assertions(6)

    const mockError = new Error("An execution error")
    mockExecutorExecute.mockImplementation(() => {
      throw mockError
    })

    const executionManager = new ExecutionManager(mockConfig, mockWalletManager)
    executionManager.executorFactory = mockExecutorFactory
    executionManager.logSuccess = vi.fn()
    executionManager.logFailure = vi.fn()
    executionManager.logException = vi.fn()

    const mockWallet = {
      signer: "Signer A" as unknown as Signer,
    } as unknown as Wallet

    await executionManager.executeTask(mockQueue[0]!, mockWallet)

    expect(mockExecutorFactory.getExecutor).toHaveBeenCalledExactlyOnceWith(
      mockQueue[0]?.executor,
      mockExecutorConfig,
    )
    expect(mockExecutorExecute).toHaveBeenCalledExactlyOnceWith(mockQueue[0], mockWallet.signer)
    expect(mockWalletManagerRequestNewProviderConnection).toHaveBeenCalledTimes(1)

    const executorInstance = mockExecutorFactory.getExecutor(
      mockQueue[0]!.executor,
      mockExecutorConfig,
    )
    expect(executionManager.logException).toHaveBeenCalledExactlyOnceWith(
      mockQueue[0],
      `Exception during execution of ${mockQueue[0]?.executor}: ${mockError.message}`,
      executorInstance,
    )
    expect(executionManager.logSuccess).toHaveBeenCalledTimes(0)
    expect(executionManager.logFailure).toHaveBeenCalledTimes(0)
  })

  it("executeTask: Calls onTaskStarted hook", async () => {
    expect.assertions(1)

    const mockOnTaskStarted = vi.fn().mockResolvedValue(null)
    const mockResult = { isSuccess: () => true } as unknown as ExecutionResult
    mockExecutorExecute.mockReturnValue(mockResult)
    mockExecutorFactoryGetExecutor.mockReturnValue({
      execute: (task: Task, signer: Signer) => mockExecutorExecute(task, signer),
      onTaskStarted: mockOnTaskStarted,
    } as unknown as ExecutorAbstract)

    const executionManager = new ExecutionManager(mockConfig, mockWalletManager)
    executionManager.executorFactory = mockExecutorFactory
    executionManager.logSuccess = vi.fn()

    const mockWallet = { signer: "Signer A" as unknown as Signer } as unknown as Wallet
    await executionManager.executeTask(mockQueue[0]!, mockWallet)

    expect(mockOnTaskStarted).toHaveBeenCalledExactlyOnceWith(mockQueue[0])
  })

  it("executeTask: Logs warning when onTaskStarted hook throws", async () => {
    expect.assertions(2)

    const mockError = new Error("onTaskStarted failure")
    const mockOnTaskStarted = vi.fn().mockRejectedValue(mockError)
    const mockResult = { isSuccess: () => true } as unknown as ExecutionResult
    mockExecutorExecute.mockReturnValue(mockResult)
    mockExecutorFactoryGetExecutor.mockReturnValue({
      execute: (task: Task, signer: Signer) => mockExecutorExecute(task, signer),
      onTaskStarted: mockOnTaskStarted,
    } as unknown as ExecutorAbstract)

    const executionManager = new ExecutionManager(mockConfig, mockWalletManager)
    executionManager.executorFactory = mockExecutorFactory
    executionManager.logSuccess = vi.fn()
    const loggerSpy = spyOnLogger(executionManager)

    const mockWallet = { signer: "Signer A" as unknown as Signer } as unknown as Wallet
    await executionManager.executeTask(mockQueue[0]!, mockWallet)

    // Wait for the fire-and-forget promise to settle
    await vi.waitFor(() => {
      expect(loggerSpy.warn).toHaveBeenCalledWith(
        `onTaskStarted hook failed for task ${mockQueue[0]!.id}: ${mockError}`,
      )
    })
    expect(executionManager.logSuccess).toHaveBeenCalled()
  })

  it("logSuccess: Logs and updates database with EXECUTED", async () => {
    expect.assertions(4)

    const mockResult = createMockResult(
      mockQueue[0]!,
      ["0x112233".padEnd(66), "0x332211".padEnd(66)],
      "",
    )

    const manager = new ExecutionManager(mockConfig, mockWalletManager)
    const loggerSpy = spyOnLogger(manager)

    await db.insert(schema.queue).values(initialTable[0]!)

    await manager.logSuccess(mockResult)

    expect(loggerSpy.info).toHaveBeenCalledWith(
      `Task ${mockResult.task.id} ${mockResult.task.executor} ${Status.EXECUTED} with hash: ${mockResult.getTxHashes()[0]}`,
      {
        executor: "UnitTest",
        status: "EXECUTED",
        taskId: 1,
        txHashes:
          "0x112233                                                          ,0x332211                                                          ",
      },
    )

    const updatedTx = await db.query.queue.findFirst({
      where: eq(schema.queue.task_hash, initialTable[0]!.task_hash),
    })
    expect(updatedTx?.status).toBe(Status.EXECUTED)
    expect(updatedTx?.tx_hashes).toStrictEqual(mockResult.getTxHashes())
    expect(updatedTx?.status_message).toBe("")
  })

  it("logSuccess: Handles non-null gasPrice", async () => {
    expect.assertions(2)

    const mockResult = {
      ...createMockResult(mockQueue[0]!, ["0x112233".padEnd(66)], ""),
      gasPrice: 50000000000n,
      gasUsage: 21000,
    } as unknown as ExecutionResult

    const manager = new ExecutionManager(mockConfig, mockWalletManager)

    await db.insert(schema.queue).values(initialTable[0]!)

    await manager.logSuccess(mockResult)

    const updatedTx = await db.query.queue.findFirst({
      where: eq(schema.queue.task_hash, initialTable[0]!.task_hash),
    })
    expect(updatedTx?.gas_price).toBe("50000000000")
    expect(updatedTx?.gas_usage).toBe(21000n)
  })

  it("logSuccess: Calls onTaskExecuted hook with txHash", async () => {
    expect.assertions(1)

    const mockOnTaskExecuted = vi.fn().mockResolvedValue(null)
    const mockExecutor = {
      onTaskExecuted: mockOnTaskExecuted,
    } as unknown as ExecutorAbstract

    const mockTxHash = "0x112233".padEnd(66)
    const mockResult = createMockResult(mockQueue[0]!, [mockTxHash], "")

    const manager = new ExecutionManager(mockConfig, mockWalletManager)
    await db.insert(schema.queue).values(initialTable[0]!)

    await manager.logSuccess(mockResult, mockExecutor)

    expect(mockOnTaskExecuted).toHaveBeenCalledExactlyOnceWith(mockQueue[0], mockTxHash)
  })

  it("logSuccess: Does not call onTaskExecuted when no txHash", async () => {
    expect.assertions(1)

    const mockOnTaskExecuted = vi.fn().mockResolvedValue(null)
    const mockExecutor = {
      onTaskExecuted: mockOnTaskExecuted,
    } as unknown as ExecutorAbstract

    const mockResult = createMockResult(mockQueue[0]!, [], "")

    const manager = new ExecutionManager(mockConfig, mockWalletManager)
    await db.insert(schema.queue).values(initialTable[0]!)

    await manager.logSuccess(mockResult, mockExecutor)

    expect(mockOnTaskExecuted).not.toHaveBeenCalled()
  })

  it("logSuccess: Logs warning when onTaskExecuted hook throws", async () => {
    expect.assertions(1)

    const mockError = new Error("onTaskExecuted failure")
    const mockOnTaskExecuted = vi.fn().mockRejectedValue(mockError)
    const mockExecutor = {
      onTaskExecuted: mockOnTaskExecuted,
    } as unknown as ExecutorAbstract

    const mockTxHash = "0x112233".padEnd(66)
    const mockResult = createMockResult(mockQueue[0]!, [mockTxHash], "")

    const manager = new ExecutionManager(mockConfig, mockWalletManager)
    const loggerSpy = spyOnLogger(manager)
    await db.insert(schema.queue).values(initialTable[0]!)

    await manager.logSuccess(mockResult, mockExecutor)

    await vi.waitFor(() => {
      expect(loggerSpy.warn).toHaveBeenCalledWith(
        `onTaskExecuted hook failed for task ${mockQueue[0]!.id}: ${mockError}`,
      )
    })
  })

  it("logFailure: Logs and schedules call to retry", async () => {
    expect.assertions(2)

    const mockScheduleRetry = vi.fn()

    const mockTxHashes = ["0x445566", "0x665544"]
    const mockMessage = "Some error message"
    const mockNow = 1000000000000
    vi.spyOn(Date, "now").mockReturnValue(mockNow)

    const mockResult = createMockResult({ ...mockQueue[0]! }, mockTxHashes, mockMessage)

    const manager = new ExecutionManager(mockConfig, mockWalletManager)
    const loggerSpy = spyOnLogger(manager)
    manager.scheduleRetry = mockScheduleRetry

    await manager.logFailure(mockResult)

    expect(loggerSpy.warn).toHaveBeenCalledWith(
      `Task ${mockResult.task.id} ${mockResult.task.executor} ${Status.ERROR_RETRY}`,
      {
        executor: "UnitTest",
        status: "ERROR_RETRY",
        taskId: 1,
        txHashes: "0x445566,0x665544",
      },
    )
    expect(mockScheduleRetry).toBeCalledWith(mockQueue[0], mockMessage, mockTxHashes)
  })

  it("logFailure: Logs and updates database with NO_RETRY", async () => {
    expect.assertions(4)

    const mockQueueItem = {
      ...mockQueue[0]!,
      shouldRetry: false,
    }

    const mockResult = createMockResult(
      mockQueueItem,
      ["0x778899".padEnd(66), "0x998877".padEnd(66)],
      "Failure message 2",
    )

    const manager = new ExecutionManager(mockConfig, mockWalletManager)
    const loggerSpy = spyOnLogger(manager)

    await db.insert(schema.queue).values({ ...initialTable[0]!, should_retry: false })

    await manager.logFailure(mockResult)

    expect(loggerSpy.warn).toHaveBeenCalledWith(
      `Task ${mockResult.task.id} ${mockResult.task.executor} ${Status.ERROR_NO_RETRY}`,
      {
        executor: "UnitTest",
        status: "ERROR_NO_RETRY",
        taskId: 1,
      },
    )

    const updatedTx = await db.query.queue.findFirst({
      where: eq(schema.queue.task_hash, initialTable[0]!.task_hash),
    })
    expect(updatedTx?.status).toBe(Status.ERROR_NO_RETRY)
    expect(updatedTx?.tx_hashes).toStrictEqual(mockResult.getTxHashes())
    expect(updatedTx?.status_message).toBe("Failure message 2")
  })

  it("logFailure: Handles non-null gasPrice in NO_RETRY case", async () => {
    expect.assertions(2)

    const mockQueueItem = {
      ...mockQueue[0]!,
      shouldRetry: false,
    }

    const mockResult = {
      ...createMockResult(mockQueueItem, ["0x778899".padEnd(66)], "Failure message"),
      gasPrice: 75000000000n,
      gasUsage: 42000,
    } as unknown as ExecutionResult

    const manager = new ExecutionManager(mockConfig, mockWalletManager)

    await db.insert(schema.queue).values({ ...initialTable[0]!, should_retry: false })

    await manager.logFailure(mockResult)

    const updatedTx = await db.query.queue.findFirst({
      where: eq(schema.queue.task_hash, initialTable[0]!.task_hash),
    })
    expect(updatedTx?.gas_price).toBe("75000000000")
    expect(updatedTx?.gas_usage).toBe(42000n)
  })

  it("logFailure: Calls onTaskRetry hook when shouldRetry is true", async () => {
    expect.assertions(1)

    const mockOnTaskRetry = vi.fn().mockResolvedValue(null)
    const mockExecutor = {
      onTaskRetry: mockOnTaskRetry,
    } as unknown as ExecutorAbstract

    const mockResult = createMockResult(mockQueue[0]!, ["0x445566"], "Error message")

    const manager = new ExecutionManager(mockConfig, mockWalletManager)
    manager.scheduleRetry = vi.fn()

    await manager.logFailure(mockResult, mockExecutor)

    expect(mockOnTaskRetry).toHaveBeenCalledExactlyOnceWith(mockQueue[0])
  })

  it("logFailure: Logs warning when onTaskRetry hook throws", async () => {
    expect.assertions(1)

    const mockError = new Error("onTaskRetry failure")
    const mockOnTaskRetry = vi.fn().mockRejectedValue(mockError)
    const mockExecutor = {
      onTaskRetry: mockOnTaskRetry,
    } as unknown as ExecutorAbstract

    const mockResult = createMockResult(mockQueue[0]!, ["0x445566"], "Error message")

    const manager = new ExecutionManager(mockConfig, mockWalletManager)
    const loggerSpy = spyOnLogger(manager)
    manager.scheduleRetry = vi.fn()

    await manager.logFailure(mockResult, mockExecutor)

    await vi.waitFor(() => {
      expect(loggerSpy.warn).toHaveBeenCalledWith(
        `onTaskRetry hook failed for task ${mockQueue[0]!.id}: ${mockError}`,
      )
    })
  })

  it("logFailure: Calls onTaskFailed hook when shouldRetry is false", async () => {
    expect.assertions(1)

    const mockOnTaskFailed = vi.fn().mockResolvedValue(null)
    const mockExecutor = {
      onTaskFailed: mockOnTaskFailed,
    } as unknown as ExecutorAbstract

    const mockQueueItem = { ...mockQueue[0]!, shouldRetry: false }
    const mockResult = createMockResult(mockQueueItem, ["0x445566"], "Error message")

    const manager = new ExecutionManager(mockConfig, mockWalletManager)
    await db.insert(schema.queue).values({ ...initialTable[0]!, should_retry: false })

    await manager.logFailure(mockResult, mockExecutor)

    expect(mockOnTaskFailed).toHaveBeenCalledExactlyOnceWith(mockQueueItem)
  })

  it("logFailure: Logs warning when onTaskFailed hook throws", async () => {
    expect.assertions(1)

    const mockError = new Error("onTaskFailed failure")
    const mockOnTaskFailed = vi.fn().mockRejectedValue(mockError)
    const mockExecutor = {
      onTaskFailed: mockOnTaskFailed,
    } as unknown as ExecutorAbstract

    const mockQueueItem = { ...mockQueue[0]!, shouldRetry: false }
    const mockResult = createMockResult(mockQueueItem, ["0x445566"], "Error message")

    const manager = new ExecutionManager(mockConfig, mockWalletManager)
    const loggerSpy = spyOnLogger(manager)
    await db.insert(schema.queue).values({ ...initialTable[0]!, should_retry: false })

    await manager.logFailure(mockResult, mockExecutor)

    await vi.waitFor(() => {
      expect(loggerSpy.warn).toHaveBeenCalledWith(
        `onTaskFailed hook failed for task ${mockQueueItem.id}: ${mockError}`,
      )
    })
  })

  it("logException: Logs and updates database with EXCEPTION w/ retry", async () => {
    expect.assertions(5)

    const mockScheduleRetry = vi.fn()
    const manager = new ExecutionManager(mockConfig, mockWalletManager)
    const loggerSpy = spyOnLogger(manager)
    manager.scheduleRetry = mockScheduleRetry

    const mockTask = {
      ...mockQueue[0]!,
    }
    const mockMessage = "Logging an exception"

    await db.insert(schema.queue).values(initialTable[0]!)

    await manager.logException(mockTask, mockMessage)

    expect(loggerSpy.error).toHaveBeenCalledExactlyOnceWith(
      `Task ${mockTask.id} ${Status.EXCEPTION} with message ${mockMessage}`,
      {
        executor: "UnitTest",
        status: "EXCEPTION",
        taskId: 1,
      },
    )
    expect(mockScheduleRetry).toHaveBeenCalledExactlyOnceWith(mockTask, mockMessage)

    const updatedTx = await db.query.queue.findFirst({
      where: eq(schema.queue.task_hash, initialTable[0]!.task_hash),
    })
    expect(updatedTx?.status).toBe(Status.EXCEPTION)
    expect(updatedTx?.tx_hashes).toBe(null)
    expect(updatedTx?.status_message).toBe(mockMessage)
  })

  it("logException: Logs and updates database with EXCEPTION w/o retry", async () => {
    expect.assertions(5)

    const mockTask = {
      ...mockQueue[0]!,
      shouldRetry: false,
    }
    const mockMessage = "Logging an exception"

    const mockScheduleRetry = vi.fn()
    const manager = new ExecutionManager(mockConfig, mockWalletManager)
    const loggerSpy = spyOnLogger(manager)
    manager.scheduleRetry = mockScheduleRetry

    await db.insert(schema.queue).values({ ...initialTable[0]!, should_retry: false })

    await manager.logException(mockTask, mockMessage)

    expect(loggerSpy.error).toHaveBeenCalledWith(
      `Task ${mockTask.id} ${Status.EXCEPTION} with message ${mockMessage}`,
      {
        executor: "UnitTest",
        status: "EXCEPTION",
        taskId: 1,
      },
    )
    expect(mockScheduleRetry).toHaveBeenCalledTimes(0)

    const updatedTx = await db.query.queue.findFirst({
      where: eq(schema.queue.task_hash, initialTable[0]!.task_hash),
    })
    expect(updatedTx?.status).toBe(Status.EXCEPTION)
    expect(updatedTx?.tx_hashes).toBe(null)
    expect(updatedTx?.status_message).toBe(mockMessage)
  })

  it("logException: Calls onTaskRetry hook when shouldRetry is true", async () => {
    expect.assertions(1)

    const mockOnTaskRetry = vi.fn().mockResolvedValue(null)
    const mockExecutor = {
      onTaskRetry: mockOnTaskRetry,
    } as unknown as ExecutorAbstract

    const mockTask = { ...mockQueue[0]! }
    const mockMessage = "Exception message"

    const manager = new ExecutionManager(mockConfig, mockWalletManager)
    manager.scheduleRetry = vi.fn()
    await db.insert(schema.queue).values(initialTable[0]!)

    await manager.logException(mockTask, mockMessage, mockExecutor)

    expect(mockOnTaskRetry).toHaveBeenCalledExactlyOnceWith(mockTask)
  })

  it("logException: Logs warning when onTaskRetry hook throws", async () => {
    expect.assertions(1)

    const mockError = new Error("onTaskRetry failure")
    const mockOnTaskRetry = vi.fn().mockRejectedValue(mockError)
    const mockExecutor = {
      onTaskRetry: mockOnTaskRetry,
    } as unknown as ExecutorAbstract

    const mockTask = { ...mockQueue[0]! }
    const mockMessage = "Exception message"

    const manager = new ExecutionManager(mockConfig, mockWalletManager)
    const loggerSpy = spyOnLogger(manager)
    manager.scheduleRetry = vi.fn()
    await db.insert(schema.queue).values(initialTable[0]!)

    await manager.logException(mockTask, mockMessage, mockExecutor)

    await vi.waitFor(() => {
      expect(loggerSpy.warn).toHaveBeenCalledWith(
        `onTaskRetry hook failed for task ${mockTask.id}: ${mockError}`,
      )
    })
  })

  it("logException: Calls onTaskFailed hook when shouldRetry is false", async () => {
    expect.assertions(1)

    const mockOnTaskFailed = vi.fn().mockResolvedValue(null)
    const mockExecutor = {
      onTaskFailed: mockOnTaskFailed,
    } as unknown as ExecutorAbstract

    const mockTask = { ...mockQueue[0]!, shouldRetry: false }
    const mockMessage = "Exception message"

    const manager = new ExecutionManager(mockConfig, mockWalletManager)
    await db.insert(schema.queue).values({ ...initialTable[0]!, should_retry: false })

    await manager.logException(mockTask, mockMessage, mockExecutor)

    expect(mockOnTaskFailed).toHaveBeenCalledExactlyOnceWith(mockTask)
  })

  it("logException: Logs warning when onTaskFailed hook throws", async () => {
    expect.assertions(1)

    const mockError = new Error("onTaskFailed failure")
    const mockOnTaskFailed = vi.fn().mockRejectedValue(mockError)
    const mockExecutor = {
      onTaskFailed: mockOnTaskFailed,
    } as unknown as ExecutorAbstract

    const mockTask = { ...mockQueue[0]!, shouldRetry: false }
    const mockMessage = "Exception message"

    const manager = new ExecutionManager(mockConfig, mockWalletManager)
    const loggerSpy = spyOnLogger(manager)
    await db.insert(schema.queue).values({ ...initialTable[0]!, should_retry: false })

    await manager.logException(mockTask, mockMessage, mockExecutor)

    await vi.waitFor(() => {
      expect(loggerSpy.warn).toHaveBeenCalledWith(
        `onTaskFailed hook failed for task ${mockTask.id}: ${mockError}`,
      )
    })
  })

  it("scheduleRetry: First attempt", async () => {
    expect.assertions(4)

    const mockTask = {
      ...mockQueue[0]!,
    }
    const mockTxHashes = ["0x445566".padEnd(66), "0x665544".padEnd(66)]
    const mockMessage = "Some error message"
    const mockNow = 1000000000000
    vi.spyOn(Date, "now").mockReturnValue(mockNow)

    const manager = new ExecutionManager(mockConfig, mockWalletManager)

    await db.insert(schema.queue).values(initialTable[0]!)

    await manager.scheduleRetry(mockTask, mockMessage, mockTxHashes)

    const updatedTx = await db.query.queue.findFirst({
      where: eq(schema.queue.task_hash, initialTable[0]!.task_hash),
    })
    expect(updatedTx?.status).toBe(Status.ERROR_RETRY)
    expect(updatedTx?.previous_attempt_region).toBe(manager.executorRegion)
    expect(updatedTx?.next_attempt).toEqual(
      new Date(mockNow + Math.pow(mockConfig.baseRetryInterval, mockQueue[0]!.attempts + 1) * 1000),
    )
    expect(updatedTx?.attempts).toBe(mockQueue[0]!.attempts + 1)
  })

  it("scheduleRetry: Later attempt", async () => {
    expect.assertions(4)

    const mockTask = {
      ...mockQueue[1]!,
    }
    const mockTxHashes = ["0x445566".padEnd(66), "0x665544".padEnd(66)]
    const mockMessage = "Some error message"
    const mockNow = 1000000000000
    vi.spyOn(Date, "now").mockReturnValue(mockNow)

    const manager = new ExecutionManager(mockConfig, mockWalletManager)

    await db.insert(schema.queue).values(initialTable[1]!)

    await manager.scheduleRetry(mockTask, mockMessage, mockTxHashes)

    const updatedTx = await db.query.queue.findFirst({
      where: eq(schema.queue.task_hash, initialTable[1]!.task_hash),
    })
    expect(updatedTx?.status).toBe(Status.ERROR_RETRY)
    expect(updatedTx?.previous_attempt_region).toBe(manager.executorRegion)
    expect(updatedTx?.next_attempt).toEqual(
      new Date(mockNow + Math.pow(mockConfig.baseRetryInterval, mockQueue[1]!.attempts + 1) * 1000),
    )
    expect(updatedTx?.attempts).toBe(mockQueue[1]!.attempts + 1)
  })

  it("scheduleRetry: Max interval", async () => {
    expect.assertions(4)

    const mockAttempts = 1000
    const mockTask = {
      ...mockQueue[0]!,
      attempts: mockAttempts,
    }
    const mockTxHashes = ["0x445566".padEnd(66), "0x665544".padEnd(66)]
    const mockMessage = "Some error message"
    const mockNow = 1000000000000
    vi.spyOn(Date, "now").mockReturnValue(mockNow)

    const manager = new ExecutionManager(mockConfig, mockWalletManager)

    await db.insert(schema.queue).values({ ...initialTable[0]!, attempts: mockAttempts })

    await manager.scheduleRetry(mockTask, mockMessage, mockTxHashes)

    const updatedTx = await db.query.queue.findFirst({
      where: eq(schema.queue.task_hash, initialTable[0]!.task_hash),
    })
    expect(updatedTx?.status).toBe(Status.ERROR_RETRY)
    expect(updatedTx?.previous_attempt_region).toBe(manager.executorRegion)
    expect(updatedTx?.next_attempt).toEqual(new Date(mockNow + mockConfig.maxRetryInterval * 1000))
    expect(updatedTx?.attempts).toBe(mockAttempts + 1)
  })

  it("shutdown: Triggers shutdown", async () => {
    vi.useFakeTimers()
    expect.assertions(5)

    const spyClearTimeout = vi.spyOn(global, "clearTimeout")

    const manager = new ExecutionManager(mockConfig, mockWalletManager)
    manager.timerProcessQueue = 543 as unknown as NodeJS.Timeout

    expect(manager.shutdownInProgress).toBe(false)

    const shutdownPromise = manager.shutdown()

    await vi.runOnlyPendingTimersAsync()
    expect(manager.shutdownInProgress).toBe(true)
    expect(spyClearTimeout).toHaveBeenCalledTimes(1)
    expect(spyClearTimeout).toHaveBeenCalledWith(manager.timerProcessQueue)

    await expect(shutdownPromise).resolves.toBe(undefined)
  })

  it("shutdown: Doesn't return on running processes, but after it ends", async () => {
    vi.useFakeTimers()
    expect.assertions(4)

    const manager = new ExecutionManager(mockConfig, mockWalletManager)
    manager.runningProcesses = 1
    expect(manager.shutdownInProgress).toBe(false)

    const shutdownPromise = manager.shutdown()

    await vi.runOnlyPendingTimersAsync()
    expect(manager.shutdownInProgress).toBe(true)

    // Verify shutdown hasn't completed yet while processes are running
    let shutdownCompleted = false
    void shutdownPromise.then(() => {
      shutdownCompleted = true
      return null
    })
    await vi.runOnlyPendingTimersAsync()
    expect(shutdownCompleted).toBe(false)

    // Now allow shutdown to complete
    manager.runningProcesses = 0
    await vi.runOnlyPendingTimersAsync()
    await expect(shutdownPromise).resolves.toBe(undefined)
  })

  it("printTasks: Logs all running tasks", () => {
    expect.assertions(4)

    const manager = new ExecutionManager(mockConfig, mockWalletManager)
    const loggerSpy = spyOnLogger(manager)

    // Add tasks to the queue
    manager.tasksBeingProcessed.push(mockQueue[0]!)
    manager.tasksBeingProcessed.push(mockQueue[1]!)

    manager.printTasks()

    expect(loggerSpy.debug).toHaveBeenCalledTimes(2)
    expect(loggerSpy.debug).toHaveBeenNthCalledWith(
      1,
      `Running task:\t${mockQueue[0]?.id}\t${mockQueue[0]?.executor}\t${mockQueue[0]?.network}\t${mockQueue[0]?.priority}`,
      {
        taskId: mockQueue[0]?.id,
        executor: mockQueue[0]?.executor,
        network: mockQueue[0]?.network,
        priority: mockQueue[0]?.priority,
      },
    )
    expect(loggerSpy.debug).toHaveBeenNthCalledWith(
      2,
      `Running task:\t${mockQueue[1]?.id}\t${mockQueue[1]?.executor}\t${mockQueue[1]?.network}\t${mockQueue[1]?.priority}`,
      {
        taskId: mockQueue[1]?.id,
        executor: mockQueue[1]?.executor,
        network: mockQueue[1]?.network,
        priority: mockQueue[1]?.priority,
      },
    )
    expect(manager.tasksBeingProcessed.size()).toBe(2)
  })

  it("printTasks: Handles empty queue", () => {
    expect.assertions(2)

    const manager = new ExecutionManager(mockConfig, mockWalletManager)
    const loggerSpy = spyOnLogger(manager)

    manager.printTasks()

    expect(loggerSpy.debug).not.toHaveBeenCalled()
    expect(manager.tasksBeingProcessed.size()).toBe(0)
  })

  it("printTasks: Handles null task from peek", () => {
    expect.assertions(2)

    const manager = new ExecutionManager(mockConfig, mockWalletManager)
    const loggerSpy = spyOnLogger(manager)

    // Add a task to make size() > 0
    manager.tasksBeingProcessed.push(mockQueue[0]!)

    // Mock peek to return undefined on first call (simulating edge case)
    // oxlint-disable-next-line unicorn/no-useless-undefined
    vi.spyOn(manager.tasksBeingProcessed, "peek").mockReturnValue(undefined)

    manager.printTasks()

    // Should not log anything since peek returned null
    expect(loggerSpy.debug).not.toHaveBeenCalled()
    expect(manager.tasksBeingProcessed.size()).toBe(1)
  })

  it("processQueue: Calls printTasks at the correct interval", async () => {
    vi.useFakeTimers()
    expect.assertions(5)

    const executionManager = new ExecutionManager(mockConfig, mockWalletManager)
    executionManager.shutdownInProgress = true
    executionManager.getQueue = vi.fn().mockResolvedValue([])
    executionManager.printTasks = vi.fn()

    // Set printTasksInterval to 20 seconds
    executionManager.printTasksInterval = 20

    // Set current time to a multiple of 20
    const timestamp = 1000 // 1000 % 20 === 0
    vi.setSystemTime(timestamp * 1000)

    await executionManager.processQueue()

    expect(executionManager.printTasks).toHaveBeenCalledOnce()
    expect(executionManager.lastTaskPrint).toBe(timestamp)

    // Call again at the same timestamp - should NOT print
    await executionManager.processQueue()

    expect(executionManager.printTasks).toHaveBeenCalledOnce()

    // Advance time to next interval
    const nextTimestamp = 1020 // 1020 % 20 === 0
    vi.setSystemTime(nextTimestamp * 1000)

    await executionManager.processQueue()

    expect(executionManager.printTasks).toHaveBeenCalledTimes(2)
    expect(executionManager.lastTaskPrint).toBe(nextTimestamp)
  })

  it("processQueue: Does not call printTasks when time is not at interval", async () => {
    vi.useFakeTimers()
    expect.assertions(2)

    const executionManager = new ExecutionManager(mockConfig, mockWalletManager)
    executionManager.shutdownInProgress = true
    executionManager.getQueue = vi.fn().mockResolvedValue([])
    executionManager.printTasks = vi.fn()

    // Set printTasksInterval to 20 seconds
    executionManager.printTasksInterval = 20

    // Set current time to NOT a multiple of 20
    const timestamp = 1005 // 1005 % 20 === 5 (not 0)
    vi.setSystemTime(timestamp * 1000)

    await executionManager.processQueue()

    expect(executionManager.printTasks).not.toHaveBeenCalled()
    expect(executionManager.lastTaskPrint).toBe(0)
  })
})

interface CreateDatabaseQueueItemParams {
  id: number
  status: Status
  priority: number
  earliest_try_unix: number
  latest_try_unix: number | null
  should_retry: boolean
  attempts: number
  next_attempt_unix: number
  previous_attempt_region: ExecutorRegion | null
  network: Network
  executor: Executor
  data: Record<string, unknown>
}

type TaskQueueItem = TaskInput & {
  task_hash: string
  previous_attempt_region: ExecutorRegion | null
  earliest_try: Date
  latest_try: Date | null
  next_attempt: Date
}

function createDatabaseQueueItem({
  id,
  status,
  priority,
  earliest_try_unix,
  latest_try_unix,
  should_retry,
  attempts,
  next_attempt_unix,
  previous_attempt_region,
  network,
  executor,
  data,
}: CreateDatabaseQueueItemParams): TaskQueueItem {
  const task_hash = crypto
    .createHash("sha256")
    .update(`${network}|${executor}|${earliest_try_unix}|${JSON.stringify(data)}`)
    .digest("hex")

  return {
    id,
    task_hash,
    status,
    priority,
    earliest_try_unix,
    earliest_try: new Date(earliest_try_unix * 1000),
    latest_try_unix,
    latest_try: latest_try_unix === null ? null : new Date(latest_try_unix * 1000),
    should_retry,
    attempts,
    next_attempt_unix,
    next_attempt: new Date(next_attempt_unix * 1000),
    previous_attempt_region,
    network,
    executor,
    data,
  }
}

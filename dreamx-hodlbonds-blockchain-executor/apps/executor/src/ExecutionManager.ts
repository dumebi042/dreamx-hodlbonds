import type { Db } from "@dreamx-development/hodlbonds-blockchain-executor-database"
import type { ExtractTablesWithRelations } from "drizzle-orm"
import type { PgQueryResultHKT, PgTransaction } from "drizzle-orm/pg-core"

import { schema } from "@dreamx-development/hodlbonds-blockchain-executor-database"
import { Status, Task } from "@dreamx-development/hodlbonds-blockchain-executor-dto"
import { and, asc, DrizzleQueryError, eq, getTableColumns, inArray, not, sql } from "drizzle-orm"
import log4js, { type Logger } from "log4js"

import type { WalletManager } from "./WalletManager"

type DbTransaction = PgTransaction<
  PgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>

import { DatabaseProvider, getDatabaseProvider } from "./database/DatabaseProvider"
import { ExecutionResult } from "./ExecutionResult"
import { ExecutorAbstract } from "./ExecutorAbstract"
import { ExecutorFactory } from "./ExecutorFactory"
import {
  ExecutionManagerConfigSchema,
  type ExecutionManagerConfig,
  type ExecutorRegion,
} from "./schemas"
import { Queue } from "./utils/Queue"
import { sleep } from "./utils/SleepAndTimeout"
import { Wallet } from "./Wallet"

/**
 * Execution Manager
 */
export class ExecutionManager {
  executorFactory: ExecutorFactory | null = null
  databaseProvider: DatabaseProvider
  walletManager: WalletManager
  config: ExecutionManagerConfig
  executorRegion: ExecutorRegion
  network: string
  defaultRetryDeadline: string
  regionRetryBlockDeadline: string
  baseRetryInterval: number
  maxRetryInterval: number
  logger: Logger

  tasksBeingProcessed: Queue<Task> = new Queue()

  shutdownInProgress = false
  timerProcessQueue: NodeJS.Timeout | null = null
  runningProcesses = 0

  printTasksInterval = 20
  lastTaskPrint = 0

  regexConcurrentUpdateError = /could not serialize access due to concurrent update/
  regexReadWriteDependenciesError =
    /could not serialize access due to read.write dependencies among transactions/

  /**
   * Creating an execution manager
   * @param {ExecutionManagerConfig} config
   * @param {WalletManager} walletManager
   */
  constructor(config: ExecutionManagerConfig, walletManager: WalletManager) {
    this.config = ExecutionManagerConfigSchema.parse(config)
    this.executorRegion = config.executorRegion
    this.network = config.network
    this.defaultRetryDeadline = config.defaultRetryDeadline
    this.baseRetryInterval = config.baseRetryInterval
    this.maxRetryInterval = config.maxRetryInterval
    this.regionRetryBlockDeadline = config.regionRetryBlockDeadline
    this.walletManager = walletManager
    this.logger = log4js.getLogger("ExecutionManager")
    this.databaseProvider = getDatabaseProvider()
  }

  get db(): Db {
    return this.databaseProvider.getDb()
  }

  /**
   * Used to be able to mock the trx for testing
   */
  getDbTrx<T>(callback: (tx: DbTransaction) => Promise<T>): Promise<T> {
    return this.db.transaction(callback) as Promise<T>
  }

  async start() {
    this.logger.info("Starting ExecutionManager", {
      region: this.executorRegion,
      network: this.network,
      chainId: this.walletManager.config.chainId,
    })
    this.executorFactory = new ExecutorFactory(this.walletManager.getMerkleTreeManager())
    await this.processQueue()
  }

  /**
   * Get the current queue
   * @param {number} limit
   * @return {[Task]}
   */
  async getQueue(limit: number): Promise<Task[]> {
    if (limit === 0) {
      return []
    }

    try {
      return await this.getDbTrx(async (tx) => {
        await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`)

        const maxRetries = Math.floor(limit / 2)
        const queuedLimit = limit - maxRetries
        const queued = await this.getQueueOfType(Status.QUEUED, queuedLimit, tx)

        const retryLimit = limit - queued.length
        const retries = await this.getQueueOfType(Status.ERROR_RETRY, retryLimit, tx)

        const totalReturned = queued.length + retries.length
        let extraQueued: any[] = []
        if (totalReturned < limit && queued.length === queuedLimit) {
          extraQueued = await this.getQueueOfType(
            Status.QUEUED,
            limit - totalReturned,
            tx,
            queued.map((it) => it.id),
          )
        }
        const tasks = [...queued, ...retries, ...extraQueued].map((task) => new Task(task))
        const taskIds = tasks.map((task) => task.id)

        if (taskIds.length > 0) {
          await tx
            .update(schema.queue)
            .set({ status: Status.EXECUTING })
            .where(inArray(schema.queue.id, taskIds))
        }

        this.unitTestStub()
        return tasks
      })
    } catch (e: unknown) {
      // Check if this is a PostgreSQL serialization error (concurrent update conflict)
      if (e instanceof DrizzleQueryError) {
        const pgError = e.cause?.message || ""
        if (
          this.regexConcurrentUpdateError.test(pgError) ||
          this.regexReadWriteDependenciesError.test(pgError)
        ) {
          this.logger.warn("getQueue(): Rollback due to concurrent update")
          await sleep(100) // Try to get out of sync with the other executor(s)
          return []
        }
      }

      const errorMsg = `Got error while trying to get queue: ${(e as Error).message}`
      this.logger.error(errorMsg, e)
      throw new Error(errorMsg, { cause: e })
    }
  }

  /**
   *
   * @param {Status} status
   * @param {number} limit
   * @param {DbTransaction} tx
   * @param {number[]} notIds
   * @return {[*]}
   */
  getQueueOfType(status: Status, limit: number, tx: DbTransaction, notIds: number[] = []) {
    const executorRegion = this.executorRegion
    const defaultRetryDeadline = this.defaultRetryDeadline
    const regionRetryBlockDeadline = this.regionRetryBlockDeadline

    const conditions = [
      eq(schema.queue.network, this.network),
      eq(schema.queue.status, status),
      sql`${schema.queue.earliest_try} <= now()`,
      sql`(${schema.queue.next_attempt} is null OR ${schema.queue.next_attempt} <= now())`,
      // 1. If latest_try is null, check if we're inside the interval 2. Check the actual date
      sql`((${schema.queue.latest_try} is null AND ${schema.queue.earliest_try} + ${defaultRetryDeadline}::interval >= now()) OR ${schema.queue.latest_try} >= now())`,
    ]

    if (notIds.length > 0) {
      conditions.push(not(inArray(schema.queue.id, notIds)))
    }

    if (status === Status.ERROR_RETRY) {
      conditions.push(
        sql`(${schema.queue.previous_attempt_region} != ${executorRegion} OR ${schema.queue.next_attempt} + ${regionRetryBlockDeadline}::interval < now())`,
      )
    }

    return tx
      .select({
        ...getTableColumns(schema.queue),
        earliest_try_unix: sql<number>`extract(epoch from ${schema.queue.earliest_try})::integer`,
        latest_try_unix: sql<
          number | null
        >`CASE WHEN ${schema.queue.latest_try} is null THEN null ELSE extract(epoch from ${schema.queue.latest_try})::integer END`,
        next_attempt_unix: sql<
          number | null
        >`CASE WHEN ${schema.queue.next_attempt} is null THEN null ELSE extract(epoch from ${schema.queue.next_attempt})::integer END`,
      })
      .from(schema.queue)
      .where(and(...conditions))
      .orderBy(asc(schema.queue.priority), asc(schema.queue.earliest_try))
      .limit(limit)
  }

  /**
   * Process the fist n entries of the queue
   * @return {Promise<void[]>}
   */
  async processQueue(): Promise<void[]> {
    this.runningProcesses++
    const promises: Promise<void>[] = []

    try {
      const maxTasks = this.walletManager.getAvailableWalletCount()
      const queue = await this.getQueue(maxTasks)

      if (queue.length > 0) {
        this.logger.info(
          `Processing queue. ${maxTasks} available wallets (${this.tasksBeingProcessed.size()} running tasks). Returned ${queue.length} task(s) from queue.`,
        )
      }

      for (const task of queue) {
        this.tasksBeingProcessed.push(task)
        const wallet = this.walletManager.requestWalletNotNull()
        promises.push(
          this.executeTask(task, wallet)
            .then(() => {
              this.walletManager.releaseWallet(wallet)
              this.tasksBeingProcessed.remove(task)
              // oxlint-disable-next-line no-useless-return
              return
            })
            .catch((err) => {
              this.walletManager.releaseWallet(wallet)
              this.tasksBeingProcessed.remove(task)
              this.logger.error(
                `Got exception in processQueue for ${task.executor} Task ${task.id}: ${err}`,
                { taskId: task.id, executor: task.executor },
              )
            }),
        )
      }
    } catch (e: any) {
      this.logger.error(`Got error in processQueue(): ${e.message}`)
    } finally {
      if (!this.shutdownInProgress) {
        this.timerProcessQueue = setTimeout(
          () => this.processQueue(),
          this.config.processQueueDelay,
        )
      }
      this.runningProcesses--
    }

    const now = Math.floor(Date.now() / 1000)
    if (now % this.printTasksInterval === 0 && now !== this.lastTaskPrint) {
      this.printTasks()
      this.lastTaskPrint = now
    }
    return Promise.all(promises)
  }

  /**
   * Execute a task
   * @param {Task} task
   * @param {Wallet} wallet
   * @return {Promise<void>}
   */
  async executeTask(task: Task, wallet: Wallet): Promise<void> {
    this.logger.info(
      `Executing Task ${task.id} for ${task.executor} with Wallet ${wallet.id}: ${wallet.address}`,
      {
        taskId: task.id,
        executor: task.executor,
        walletId: wallet.id,
        walletAddress: wallet.address,
      },
    )

    if (!this.executorFactory) {
      throw new Error("ExecutorFactory not initialized. Call start() before processing tasks.")
    }

    const executor = this.executorFactory.getExecutor(task.executor, this.config.executorConfig)

    executor
      .onTaskStarted?.(task)
      .catch((e) => this.logger.warn(`onTaskStarted hook failed for task ${task.id}: ${e}`))

    let result
    try {
      result = await executor.execute(task, wallet.signer)
    } catch (e: any) {
      this.walletManager.requestNewProviderConnection(e)
      return this.logException(
        task,
        `Exception during execution of ${task.executor}: ${e.message}`,
        executor,
      )
    }

    if (result.isSuccess()) {
      this.logSuccess(result, executor)
    } else {
      this.logFailure(result, executor)
    }
  }

  /**
   * @param {ExecutionResult} result
   * @param {ExecutorAbstract} executor
   */
  async logSuccess(result: ExecutionResult, executor?: ExecutorAbstract): Promise<void> {
    const txHashes = result.getTxHashes()
    this.logger.info(
      `Task ${result.task.id} ${result.task.executor} ${Status.EXECUTED} with hash: ${txHashes[0]}`,
      {
        taskId: result.task.id,
        executor: result.task.executor,
        status: Status.EXECUTED,
        txHashes: txHashes.join(","),
      },
    )
    const update = {
      status: Status.EXECUTED,
      tx_hashes: txHashes,
      status_message: "",
      gas_price: result.gasPrice === null ? null : result.gasPrice.toString(),
      gas_usage: result.gasUsage,
    }
    await this.db.update(schema.queue).set(update).where(eq(schema.queue.id, result.task.id))

    if (txHashes[0]) {
      executor
        ?.onTaskExecuted?.(result.task, txHashes[0])
        .catch((e) =>
          this.logger.warn(`onTaskExecuted hook failed for task ${result.task.id}: ${e}`),
        )
    }
  }

  /**
   * @param {ExecutionResult} result
   * @param {ExecutorAbstract} executor
   */
  async logFailure(result: ExecutionResult, executor?: ExecutorAbstract): Promise<void> {
    const txHashes = result.getTxHashes()
    if (result.task.shouldRetry) {
      this.logger.warn(`Task ${result.task.id} ${result.task.executor} ${Status.ERROR_RETRY}`, {
        taskId: result.task.id,
        executor: result.task.executor,
        status: Status.ERROR_RETRY,
        txHashes: txHashes.join(","),
      })
      // oxlint-disable-next-line no-else-return
      await this.scheduleRetry(result.task, result.getMessage(), txHashes)

      executor
        ?.onTaskRetry?.(result.task)
        .catch((e) => this.logger.warn(`onTaskRetry hook failed for task ${result.task.id}: ${e}`))
    } else {
      const update = {
        status: Status.ERROR_NO_RETRY,
        tx_hashes: txHashes,
        status_message: result.getMessage(),
        gas_price: result.gasPrice === null ? null : result.gasPrice.toString(),
        gas_usage: result.gasUsage,
      }

      this.logger.warn(`Task ${result.task.id} ${result.task.executor} ${update.status}`, {
        taskId: result.task.id,
        executor: result.task.executor,
        status: update.status,
      })
      await this.db.update(schema.queue).set(update).where(eq(schema.queue.id, result.task.id))

      executor
        ?.onTaskFailed?.(result.task)
        .catch((e) => this.logger.warn(`onTaskFailed hook failed for task ${result.task.id}: ${e}`))
    }
  }

  /**
   * @param {Task} task
   * @param {string} message
   * @param {ExecutorAbstract} executor
   */
  async logException(task: Task, message: string, executor?: ExecutorAbstract) {
    this.logger.error(`Task ${task.id} ${Status.EXCEPTION} with message ${message}`, {
      taskId: task.id,
      executor: task.executor,
      status: Status.EXCEPTION,
    })
    await this.db
      .update(schema.queue)
      .set({ status: Status.EXCEPTION, status_message: message })
      .where(eq(schema.queue.id, task.id))

    if (task.shouldRetry) {
      await this.scheduleRetry(task, message)

      executor
        ?.onTaskRetry?.(task)
        .catch((e) => this.logger.warn(`onTaskRetry hook failed for task ${task.id}: ${e}`))
    } else {
      executor
        ?.onTaskFailed?.(task)
        .catch((e) => this.logger.warn(`onTaskFailed hook failed for task ${task.id}: ${e}`))
    }
  }

  /**
   *
   * @param {Task} task
   * @param {string} message
   * @param {string[]|null} txHashes
   */
  async scheduleRetry(
    task: Task,
    message: string,
    txHashes: string[] | null = null,
  ): Promise<void> {
    const update: any = {
      status: Status.ERROR_RETRY,
      tx_hashes: txHashes,
      status_message: message,
    }

    task.attempts++
    const nextAttempt =
      Math.floor(Date.now() / 1000) +
      Math.min(this.maxRetryInterval, Math.pow(this.baseRetryInterval, task.attempts))
    update["previous_attempt_region"] = this.executorRegion
    update["next_attempt"] = new Date(nextAttempt * 1000)
    update["attempts"] = task.attempts

    await this.db.update(schema.queue).set(update).where(eq(schema.queue.id, task.id))
  }

  printTasks() {
    const runningTaskCount = this.tasksBeingProcessed.size()
    for (let i = 0; i < runningTaskCount; i++) {
      const task = this.tasksBeingProcessed.peek(i)
      if (task) {
        this.logger.debug(
          `Running task:\t${task?.id}\t${task?.executor}\t${task?.network}\t${task?.priority}`,
          {
            taskId: task.id,
            executor: task.executor,
            network: task.network,
            priority: task.priority,
          },
        )
      }
    }
  }

  /**
   * @return {Promise<void>}
   */
  shutdown(): Promise<void> {
    this.logger.info("Shutting down ExecutionManager", {
      region: this.executorRegion,
      network: this.network,
      chainId: this.walletManager.config.chainId,
    })
    this.shutdownInProgress = true
    if (this.timerProcessQueue) {
      clearTimeout(this.timerProcessQueue)
    }

    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        this.logger.info(
          `Running processes: ${this.runningProcesses} Running tasks: ${this.tasksBeingProcessed.size()}`,
        )
        if (this.runningProcesses === 0 && this.tasksBeingProcessed.isEmpty()) {
          clearInterval(checkInterval)
          return resolve()
        }
      }, 1000)
    })
  }

  /* eslint-disable @typescript-eslint/no-empty-function */
  /**
   * Used to inject a exception in getQueue
   */
  unitTestStub() {}
}

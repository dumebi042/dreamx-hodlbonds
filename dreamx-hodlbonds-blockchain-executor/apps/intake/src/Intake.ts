import { type Db, schema } from "@dreamx-development/hodlbonds-blockchain-executor-database"
import { Status } from "@dreamx-development/hodlbonds-blockchain-executor-dto"
import { eq, and } from "drizzle-orm"
import log4js, { type Logger } from "log4js"

import { config } from "./config"
import { getDatabaseProvider } from "./database/DatabaseProvider"
import { MessageFactory } from "./MessageFactory"
import { computeHash } from "./utils/canonical"

/**
 *
 * TODO: Maybe store the CloudEvent id
 * TODO: Maybe split into different pubsubs per executor (More secure to have more granular access rights)
 */
export class Intake {
  databaseProvider = getDatabaseProvider()
  logger: Logger = log4js.getLogger("Intake")
  messageFactory = new MessageFactory(config.EXECUTOR)

  async initialize(): Promise<void> {
    await this.databaseProvider.initialize()
  }

  get db(): Db {
    return this.databaseProvider.getDb()
  }

  /**
   *
   * @param {string} messageId
   * @param {*} pubSubMessage
   */
  async processMessage(messageId: string, pubSubMessage: any) {
    const message = this.messageFactory.createMessage(pubSubMessage.json)
    const queue = schema.queue

    type NewTask = typeof queue.$inferInsert
    const task: NewTask = {
      status: Status.QUEUED,
      priority: message.priority,
      executor: message.executor,
      earliest_try: new Date(message.earliestTry * 1000),
      latest_try: message.latestTry === null ? null : new Date(message.latestTry * 1000),
      should_retry: message.shouldRetry,
      network: message.network,
      data: message.data,
      task_hash: computeHash(message),
    }

    let id: number | undefined
    try {
      const result = await this.db
        .insert(queue)
        .values(task)
        .returning({ id: queue.id })
        .onConflictDoNothing({ target: queue.task_hash })
      id = result[0]?.id
    } catch (e) {
      this.logger.error(
        `Failed to insert message ${messageId} ${message.executor} task into the queue table with exception: ${e}`,
        { messageId, task },
      )
      throw new Error(
        `Failed to insert message ${messageId} ${message.executor} task into the queue table with exception: ${e}`,
        { cause: e },
      )
    }

    // Exits here if successful
    if (id) {
      this.logger.info(
        `Inserted message ${messageId} a ${message.executor} task into the queue with id ${id}`,
        { messageId, taskId: id, task },
      )
      return
    }

    try {
      const existingTasks = await this.db
        .select()
        .from(queue)
        .where(
          and(
            eq(queue.network, task.network),
            eq(queue.executor, task.executor),
            eq(queue.earliest_try, task.earliest_try!),
            // preserve the JSONB equality check used previously
            // sql`data::jsonb = ${JSON.stringify(task.data)}::jsonb`,
            eq(queue.data, task.data),
            eq(queue.task_hash, task.task_hash),
          ),
        )
      if (existingTasks[0]?.id) {
        this.logger.warn(
          `Dropping new message ${messageId} ${task.executor} task after finding duplicate. Existing task has id ${existingTasks[0].id} and hash ${existingTasks[0].task_hash}`,
          {
            messageId,
            task,
            existingTaskId: existingTasks[0].id,
            existingTaskHash: existingTasks[0].task_hash,
          },
        )
        return
      }
    } catch (e) {
      this.logger.error(
        `Failed to select for duplicates for message ${messageId} ${message.executor} task exception: ${e}`,
        { messageId, task },
      )
      throw new Error(
        `Failed to select for duplicates for message ${messageId} ${message.executor} task exception: ${e}`,
        { cause: e },
      )
    }

    this.logger.error(
      `Failed to add message ${messageId} ${task.executor} task to queue, unknown reason.`,
      { messageId, task },
    )
    throw new Error(
      `Failed to add message ${messageId} ${task.executor} task to queue, unknown reason.`,
    )
  }
}

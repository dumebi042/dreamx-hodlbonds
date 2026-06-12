import { Task } from "@dreamx-development/hodlbonds-blockchain-executor-dto"
import { TransactionReceipt, TransactionResponse } from "ethers"
import log4js, { type Logger } from "log4js"

import type { ExecutorContractFunction } from "./ExecutorAbstract"

import { serializeJsonWithBigInt } from "./utils/Serialize"
import { timeout } from "./utils/SleepAndTimeout"

/**
 *
 */
export class ExecutionResult {
  processed = false
  failure = true
  message = "Not done processing"
  task: Task
  txHashes: string[] = []
  gasPrice: bigint | null = null
  gasUsage: bigint | null = null

  transactionConfirmations = 1
  transactionTimeout = 90 * 1000 // 1.5 minutes

  logger: Logger

  /**
   *
   * @param {Task} task
   */
  constructor(task: Task) {
    this.task = task
    this.logger = log4js.getLogger("ExecutionResult")
  }

  /**
   *
   * @param {Function} func
   * @param {[*]} params
   * @return {Promise<ExecutionResult>}
   */
  async processSingleTransaction(
    func: ExecutorContractFunction,
    params: any[],
  ): Promise<ExecutionResult> {
    let response
    try {
      this.logger.info(
        `Task ${this.task.id} ${this.task.executor} calling ${func.name} with: ${serializeJsonWithBigInt(params)}`,
        {
          taskId: this.task.id,
          executor: this.task.executor,
          function: func.name,
          params: serializeJsonWithBigInt(params),
        },
      )
      response = (await Promise.race([
        func(...params),
        timeout(this.transactionTimeout, "Timeout while calling function"),
      ])) as TransactionResponse

      if (!response) {
        return this.registerFailure(
          `Task ${this.task.id} ${this.task.executor} got no response while waiting for tx to be mined`,
        )
      }
    } catch (e) {
      return this.registerFailure(
        `Task ${this.task.id} ${this.task.executor} got exception while waiting for tx to be MINED: ${e}`,
      )
    }

    let receipt: TransactionReceipt | null = null
    try {
      receipt = (await Promise.race([
        response.wait(this.transactionConfirmations, this.transactionTimeout),
        timeout(this.transactionTimeout + 10_000, "Timeout while waiting for receipt"),
      ])) as TransactionReceipt

      if (!receipt) {
        return this.registerFailure(
          `Task ${this.task.id} ${this.task.executor} response.wait() didn't get ${this.transactionConfirmations} confirmations and timed out after ${this.transactionTimeout / 1000} seconds`,
        )
      }

      this.registerGas(receipt.gasPrice, receipt.gasUsed)

      if (receipt.status === 0) {
        return this.registerFailure(
          `Task ${this.task.id} ${this.task.executor} transaction reverted (status=0)`,
        )
      }

      if (!receipt.hash) {
        return this.registerFailure(
          `Task ${this.task.id} ${this.task.executor} Receipt doesn't contain a hash`,
        )
      }
    } catch (e) {
      return this.registerFailure(
        `Task ${this.task.id} ${this.task.executor} got exception while waiting for tx to be CONFIRMED: ${e}`,
      )
    }
    return this.registerSuccess([receipt.hash])
  }

  /**
   *
   * @param {string} reason
   * @return {ExecutionResult}
   */
  registerFailure(reason: string): ExecutionResult {
    this.processed = true
    this.failure = true
    this.message = reason

    this.logger.error(`Task ${this.task.id} ${this.task.executor} failed with reason ${reason}`, {
      taskId: this.task.id,
      executor: this.task.executor,
    })

    return this
  }

  /**
   *
   * @param {string[]} txHashes
   * @return {ExecutionResult}
   */
  registerSuccess(txHashes: string[]): ExecutionResult {
    this.processed = true
    this.failure = false
    this.message = "Successfully mined"
    this.txHashes = txHashes

    return this
  }

  /**
   *
   * @param {bigint|null} gasPrice
   * @param {bigint|null} gasUsage
   */
  registerGas(gasPrice: bigint | null, gasUsage: bigint | null) {
    this.gasPrice = gasPrice
    this.gasUsage = gasUsage
  }

  /**
   * @return {boolean}
   */
  isSuccess(): boolean {
    if (!this.processed) {
      throw new Error(
        `isSuccess() called before result has been processed for task ${this.task.id} / ${this.task.executor}`,
      )
    }
    return !this.failure
  }

  /**
   * @return {string[]}
   */
  getTxHashes(): string[] {
    if (!this.processed) {
      throw new Error(
        `getTxHashes() called before result has been processed for task ${this.task.id} / ${this.task.executor}`,
      )
    }
    return this.txHashes
  }

  /**
   * @return {string}
   */
  getMessage(): string {
    if (!this.processed) {
      throw new Error(
        `getMessage() called before result has been processed for task ${this.task.id} / ${this.task.executor}`,
      )
    }
    return this.message
  }
}

import type { Signer } from "ethers"

import { TradingApiClient } from "@dreamx-development/hodlbonds-blockchain-executor-client"
import {
  Task,
  HodlBondsTradeTask,
  HodlBondsTradeOp,
} from "@dreamx-development/hodlbonds-blockchain-executor-dto"

import type { MerkleTreeManager } from "../MerkleTreeManager"

import { baseConfig } from "../config"
import { ExecutionResult } from "../ExecutionResult"
import { ExecutorAbstract } from "../ExecutorAbstract"

/**
 * Executor for HodlBonds trades
 */
export class HodlBondsTrade extends ExecutorAbstract {
  private merkleTreeManager: MerkleTreeManager
  private static tradingApiClient?: TradingApiClient

  /**
   * Create a HodlBondsTrade executor
   * @param config - Executor configuration
   * @param merkleTreeManager - Merkle tree manager for proof generation
   */
  constructor(config: any, merkleTreeManager: MerkleTreeManager) {
    super(config)
    this.merkleTreeManager = merkleTreeManager
  }

  /**
   * Get or create the TradingApiClient singleton
   */
  private getTradingApiClient(): TradingApiClient {
    if (!HodlBondsTrade.tradingApiClient) {
      HodlBondsTrade.tradingApiClient = new TradingApiClient(baseConfig.TRADING_API_STATUS_TOPIC)
    }
    return HodlBondsTrade.tradingApiClient
  }

  /**
   * Publish an order status update to the trading-api
   */
  private async publishUpdate(
    task: Task,
    status: "pending" | "retry" | "executed" | "failed",
    txHash?: string,
  ): Promise<void> {
    const tradeTask = HodlBondsTradeTask.fromTask(task)
    const { clientOrderId } = tradeTask.data

    await this.getTradingApiClient().publishOrderStatusUpdate({
      clientOrderId,
      status,
      timestamp: new Date().toISOString(),
      ...(txHash && { txHash }),
    })
  }

  override async onTaskStarted(task: Task): Promise<void> {
    await this.publishUpdate(task, "pending")
  }

  override async onTaskExecuted(task: Task, txHash: string): Promise<void> {
    await this.publishUpdate(task, "executed", txHash)
  }

  override async onTaskRetry(task: Task): Promise<void> {
    await this.publishUpdate(task, "retry")
  }

  override async onTaskFailed(task: Task): Promise<void> {
    await this.publishUpdate(task, "failed")
  }

  /**
   * Execute the HodlBonds trade task
   * @param {Task} task
   * @param {Signer} signer
   * @return {Promise<ExecutionResult>}
   */
  async execute(task: Task, signer: Signer): Promise<ExecutionResult> {
    try {
      const hodlBondsTradeTask = HodlBondsTradeTask.fromTask(task)
      const hodlBondsTradeData = hodlBondsTradeTask.data
      const contract = await this.getContract(
        "Vault",
        task.network,
        signer,
        hodlBondsTradeData.poolAddress,
      )

      const walletAddress = await signer.getAddress()
      const merkleProof = this.merkleTreeManager.generateProof(walletAddress)

      this.logger.info(
        `Executing Task ${task.id} (${hodlBondsTradeData.op}) for Vault ${hodlBondsTradeData.poolAddress}`,
        { taskId: task.id, task },
      )

      switch (hodlBondsTradeData.op) {
        case HodlBondsTradeOp.UNISWAP_EXACT_IN:
          if (!contract["swapExactInputSingle"]) {
            throw new Error(`Contract missing method swapExactInputSingle`)
          }

          return await this.singleTransactionResult(task, contract["swapExactInputSingle"], [
            hodlBondsTradeData.quantity,
            hodlBondsTradeData.minAmountOut,
            hodlBondsTradeData.deadline,
            hodlBondsTradeData.zeroForOne,
            merkleProof,
            { ...(await this.calculateGasParameters(signer)) },
          ])

        case HodlBondsTradeOp.LFJ_EXACT_IN:
          if (!contract["lbSwapExactInputSingle"]) {
            throw new Error(`Contract missing method lbSwapExactInputSingle`)
          }

          return await this.singleTransactionResult(task, contract["lbSwapExactInputSingle"], [
            hodlBondsTradeData.quantity,
            hodlBondsTradeData.minAmountOut,
            hodlBondsTradeData.inputToken,
            hodlBondsTradeData.deadline,
            merkleProof,
            { ...(await this.calculateGasParameters(signer)) },
          ])

        case HodlBondsTradeOp.BLACKHOLE_EXACT_IN:
          if (!contract["blackholeSwapExactInputSingle"]) {
            throw new Error(`Contract missing method blackholeSwapExactInputSingle`)
          }

          return await this.singleTransactionResult(
            task,
            contract["blackholeSwapExactInputSingle"],
            [
              hodlBondsTradeData.quantity,
              hodlBondsTradeData.minAmountOut,
              hodlBondsTradeData.inputToken,
              hodlBondsTradeData.deadline,
              merkleProof,
              { ...(await this.calculateGasParameters(signer)) },
            ],
          )
      }
    } catch (e) {
      this.logger.error(`Got error while executing: ${e}`, { taskId: task.id })
      throw e
    }
  }
}

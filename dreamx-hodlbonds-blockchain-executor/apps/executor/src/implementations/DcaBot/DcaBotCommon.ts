import { Network, Task } from "@dreamx-development/hodlbonds-blockchain-executor-dto"
import { ethers, type Signer, toBigInt } from "ethers"

import { ExecutionResult } from "@/ExecutionResult"
import { ExecutorAbstract } from "@/ExecutorAbstract"

export interface DcaValues {
  fromAddresses: string[]
  toAddresses: string[]
  tokenAmountsPerRun: bigint[]
}

export abstract class DcaBotCommon extends ExecutorAbstract {
  /**
   *
   * @param {Task} task
   * @param {Signer} signer
   */
  async execute(task: Task, signer: Signer): Promise<ExecutionResult> {
    try {
      const { fromAddresses, toAddresses, tokenAmountsPerRun } = await this.processDcaTask(
        task,
        signer,
      )

      const dcaContract = await this.getContract("DcaBot", task.network, signer)

      if (task.network === Network.met) {
        // oxlint-disable-next-line no-else-return
        return this.singleTransactionResult(task, dcaContract["multiTradeTokenForV2"]!, [
          fromAddresses,
          toAddresses,
          tokenAmountsPerRun,
        ])
      } else {
        return this.singleTransactionResult(task, dcaContract["multiTradeTokenForV2"]!, [
          fromAddresses,
          toAddresses,
          tokenAmountsPerRun,
          { ...(await this.calculateGasParameters(signer)) },
        ])
      }
    } catch (e) {
      this.logger.error(`Got error while executing: ${e}`)
      throw e
    }
  }

  abstract processDcaTask(task: Task, signer: Signer): Promise<DcaValues>

  /**
   * Calculates the exchange rate between two currencies.
   *
   * @param {string} denominator - The value of the denominator currency.
   * @param {number} denominatorDecimals - The number of decimal places in the denominator currency.
   * @param {string} divisor - The value of the divisor currency.
   * @param {number} divisorDecimals - The number of decimal places in the divisor currency.
   *
   * @return {number} - The calculated exchange rate between the two currencies.
   */
  calcExchangeRate(
    denominator: string,
    denominatorDecimals: number,
    divisor: string,
    divisorDecimals: number,
  ): number {
    return (
      parseFloat(ethers.formatUnits(toBigInt(denominator), denominatorDecimals)) /
      parseFloat(ethers.formatUnits(toBigInt(divisor), divisorDecimals))
    )
  }
}

import { schema } from "@dreamx-development/hodlbonds-blockchain-executor-database"
import { Network, Task } from "@dreamx-development/hodlbonds-blockchain-executor-dto"
import { eq, and } from "drizzle-orm"
import { Contract, ethers, type Signer, TransactionResponse } from "ethers"
import log4js, { type Logger } from "log4js"
import * as z from "zod"

import { getDatabaseProvider } from "./database/DatabaseProvider"
import { ExecutionResult } from "./ExecutionResult"
import { AlphaNumericStringSchema, type ExecutorConfig } from "./schemas"
import { serializeJsonWithBigInt } from "./utils/Serialize"

/**
 *
 */
export abstract class ExecutorAbstract {
  databaseProvider = getDatabaseProvider()
  logger: Logger = log4js.getLogger(`Executor::${this.constructor.name}`)
  config: ExecutorConfig

  /**
   * Base class for Executors
   * @param {ExecutorConfig} config
   */
  constructor(config: ExecutorConfig) {
    this.config = config
  }

  /**
   * Abstract method, the actual execution
   * @param {Task} task
   * @param {Signer} signer
   * @return {Promise<ExecutionResult>}
   */
  abstract execute(task: Task, signer: Signer): Promise<ExecutionResult>

  /**
   * Called when a task is picked up for execution.
   * Override in subclasses that need to notify external systems.
   * @param {Task} task
   */
  onTaskStarted?(task: Task): Promise<void>

  /**
   * Called when a task execution succeeds.
   * @param {Task} task
   * @param {string} txHash - The transaction hash
   */
  onTaskExecuted?(task: Task, txHash: string): Promise<void>

  /**
   * Called when a task execution fails and will be retried.
   * @param {Task} task
   */
  onTaskRetry?(task: Task): Promise<void>

  /**
   * Called when a task execution permanently fails.
   * @param {Task} task
   */
  onTaskFailed?(task: Task): Promise<void>

  /**
   *
   * @param {string} contractName
   * @param {string} network
   * @param {Signer} signer
   * @param {string|null} specifiedAddress
   * @return {Promise<Contract>}
   */
  async getContract(
    contractName: string,
    network: string,
    signer: Signer,
    specifiedAddress: string | null = null,
  ): Promise<Contract> {
    if (
      !contractName ||
      !AlphaNumericStringSchema.safeParse(contractName).success ||
      !network ||
      !z.enum(Network).safeParse(network).success
    ) {
      throw new Error(`Invalid contractName (${contractName}) or network (${network})`)
    }

    const db = this.databaseProvider.getDb()

    const result = await db
      .select({ abi: schema.contracts.abi, address: schema.contracts.address })
      .from(schema.contracts)
      .where(
        and(
          eq(schema.contracts.contract_name, contractName),
          eq(schema.contracts.network, network),
        ),
      )
      .limit(1)

    if (!result[0]) {
      throw new Error(
        `Database didn't return address or abi for contract ${contractName} on network ${network}`,
      )
    }

    const { abi, address } = result[0]

    const useAddress = specifiedAddress ?? address
    if (!abi || !useAddress) {
      throw new Error(
        `Database didn't return address or abi for contract ${contractName} on network ${network}. SpecAddres: ${specifiedAddress} DbAddress: ${address} UseAddress: ${useAddress}, ABI: ${abi}`,
      )
    }

    return new ethers.Contract(useAddress, abi as ethers.InterfaceAbi, signer)
  }

  /**
   *
   * @param {Signer} signer
   * @return {Promise<GasParameters>}
   */
  async calculateGasParameters(signer: Signer): Promise<GasParameters> {
    try {
      const feeData = await signer.provider?.getFeeData()

      if (!feeData) {
        throw new Error("Not able to get feeData")
      }

      const minimumGasPrice = ethers.parseUnits(this.config.minimumGasPrice, "gwei")
      let gasPrice = minimumGasPrice

      if (feeData.maxFeePerGas) {
        // EIP-1559
        gasPrice =
          (feeData.maxFeePerGas * ethers.toBigInt(this.config.overBidPercent)) /
          ethers.toBigInt("100")
        if (gasPrice < minimumGasPrice) {
          this.logger.warn(
            `Gas price too low (${ethers.formatUnits(gasPrice, "gwei")}), using minimum of ${ethers.formatUnits(minimumGasPrice, "gwei")}`,
          )
          gasPrice = minimumGasPrice
        }
        this.logger.debug(
          `Prev block had maxFeePerGas of ${ethers.formatUnits(feeData.maxFeePerGas, "gwei")} gwei, using gas price ${ethers.formatUnits(gasPrice, "gwei")} gwei`,
        )

        // oxlint-disable-next-line no-else-return
        return {
          maxFeePerGas: gasPrice,
          maxPriorityFeePerGas: ethers.parseUnits(this.config.maximumPriorityFeePerGas, "gwei"),
        }
      } else {
        // Non EIP-1559
        this.logger.debug("No block.baseFeePerGas returned, sending pre EIP-1559 gas settings")

        if (!feeData.gasPrice) {
          throw new Error(`FeeData doesn't contain 'gasPrice': ${serializeJsonWithBigInt(feeData)}`)
        }

        gasPrice =
          (feeData.gasPrice * ethers.toBigInt(this.config.overBidPercent)) / ethers.toBigInt("100")

        if (gasPrice < minimumGasPrice) {
          this.logger.warn(
            `Gas price too low (${ethers.formatUnits(gasPrice, "gwei")}), using minimum of ${ethers.formatUnits(minimumGasPrice, "gwei")}`,
          )
          gasPrice = minimumGasPrice
        }
        this.logger.debug(
          `Prev block had gasPrice of ${ethers.formatUnits(feeData.gasPrice, "gwei")} gwei, using gas price ${ethers.formatUnits(gasPrice, "gwei")} gwei`,
        )

        return { gasPrice }
      }
    } catch (e) {
      this.logger.error(`Got exception while calculating gas price: ${e}`)
      throw e
    }
  }

  /**
   *
   * @param {Task} task
   * @param {Function} func
   * @param {[*]} params
   * @return {Promise<ExecutionResult>}
   */
  singleTransactionResult(
    task: Task,
    func: ExecutorContractFunction,
    params: any[],
  ): Promise<ExecutionResult> {
    return new ExecutionResult(task).processSingleTransaction(func, params)
  }
}

export type ExecutorContractFunction = (...args: any[]) => Promise<TransactionResponse>

interface GasEip1559 {
  maxFeePerGas: bigint
  maxPriorityFeePerGas: bigint
}

interface GasPreEip1559 {
  gasPrice: bigint
}

type GasParameters = GasEip1559 | GasPreEip1559

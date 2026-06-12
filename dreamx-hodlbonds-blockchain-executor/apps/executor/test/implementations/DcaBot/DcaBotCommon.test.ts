import type { Signer } from "ethers"

import { Network, Task } from "@dreamx-development/hodlbonds-blockchain-executor-dto"
import { describe, it, expect, vi } from "vitest"

import type { ExecutorConfig } from "@/schemas"

import { DcaBotCommon, type DcaValues } from "@/implementations/DcaBot/DcaBotCommon"

const mockExecutorConfig: ExecutorConfig = {
  minimumGasPrice: "10",
  maximumPriorityFeePerGas: "5",
  overBidPercent: 125,
}

const mockSigner = "mock signer" as unknown as Signer

/**
 * Just to be able to test the abstract class
 */
class DcaBotCommonInstance extends DcaBotCommon {
  async processDcaTask(_task: Task, _signer: Signer): Promise<DcaValues> {
    return await Promise.resolve({ fromAddresses: [], toAddresses: [], tokenAmountsPerRun: [] })
  }
}

describe("DCA Bot Abstract class", () => {
  it("execute: Happy path", async () => {
    expect.assertions(4)

    const mockTask = {
      network: Network.tst,
    } as unknown as Task
    const mockProcessDcaTaskResult = {
      fromAddresses: "Mock fromAddress",
      toAddresses: "Mock toAddress",
      tokenAmountsPerRun: "Mock tokenAmountsPerRun",
    }
    const mockMultiTradeTokenForV2 = "Mocked function"
    const mockDcaBotContract = {
      multiTradeTokenForV2: mockMultiTradeTokenForV2,
    }
    const mockCalculatedGasResult = { gas: 7733 }
    const mockSingleTransactionResult = "Mocked tx result"

    const dcaBot = new DcaBotCommonInstance(mockExecutorConfig)
    dcaBot.processDcaTask = vi.fn().mockResolvedValue(mockProcessDcaTaskResult)
    dcaBot.getContract = vi.fn().mockResolvedValue(mockDcaBotContract)
    dcaBot.calculateGasParameters = vi.fn().mockResolvedValue(mockCalculatedGasResult)
    dcaBot.singleTransactionResult = vi.fn().mockResolvedValue(mockSingleTransactionResult)

    const result = await dcaBot.execute(mockTask, mockSigner)

    expect(result).toBe(mockSingleTransactionResult)
    expect(dcaBot.getContract).toBeCalledWith("DcaBot", mockTask.network, mockSigner)
    expect(dcaBot.calculateGasParameters).toBeCalledWith(mockSigner)
    expect(dcaBot.singleTransactionResult).toBeCalledWith(mockTask, mockMultiTradeTokenForV2, [
      mockProcessDcaTaskResult.fromAddresses,
      mockProcessDcaTaskResult.toAddresses,
      mockProcessDcaTaskResult.tokenAmountsPerRun,
      mockCalculatedGasResult,
    ])
  })

  it("execute: Metis network (no gas parameters)", async () => {
    expect.assertions(4)

    const mockTask = {
      network: Network.met,
    } as unknown as Task
    const mockProcessDcaTaskResult = {
      fromAddresses: "Mock fromAddress",
      toAddresses: "Mock toAddress",
      tokenAmountsPerRun: "Mock tokenAmountsPerRun",
    }
    const mockMultiTradeTokenForV2 = "Mocked function"
    const mockDcaBotContract = {
      multiTradeTokenForV2: mockMultiTradeTokenForV2,
    }
    const mockSingleTransactionResult = "Mocked tx result"

    const dcaBot = new DcaBotCommonInstance(mockExecutorConfig)
    dcaBot.processDcaTask = vi.fn().mockResolvedValue(mockProcessDcaTaskResult)
    dcaBot.getContract = vi.fn().mockResolvedValue(mockDcaBotContract)
    dcaBot.calculateGasParameters = vi.fn()
    dcaBot.singleTransactionResult = vi.fn().mockResolvedValue(mockSingleTransactionResult)

    const result = await dcaBot.execute(mockTask, mockSigner)

    expect(result).toBe(mockSingleTransactionResult)
    expect(dcaBot.getContract).toBeCalledWith("DcaBot", mockTask.network, mockSigner)
    expect(dcaBot.calculateGasParameters).not.toBeCalled()
    expect(dcaBot.singleTransactionResult).toBeCalledWith(mockTask, mockMultiTradeTokenForV2, [
      mockProcessDcaTaskResult.fromAddresses,
      mockProcessDcaTaskResult.toAddresses,
      mockProcessDcaTaskResult.tokenAmountsPerRun,
    ])
  })

  it("execute: Handles errors correctly", async () => {
    expect.assertions(2)

    const mockTask = {
      network: Network.tst,
    } as unknown as Task
    const mockError = new Error("Processing failed")

    const dcaBot = new DcaBotCommonInstance(mockExecutorConfig)
    dcaBot.processDcaTask = vi.fn().mockRejectedValue(mockError)
    dcaBot.logger.error = vi.fn()

    await expect(dcaBot.execute(mockTask, mockSigner)).rejects.toThrow("Processing failed")
    expect(dcaBot.logger.error).toHaveBeenCalledWith(`Got error while executing: ${mockError}`)
  })

  it("calcExchangeRate: Calculates correct exchange rate", () => {
    expect.assertions(1)

    const dcaBot = new DcaBotCommonInstance(mockExecutorConfig)

    // 1000 USDC (6 decimals) / 0.5 WETH (18 decimals) = 2000 USDC per WETH
    const rate = dcaBot.calcExchangeRate(
      "1000000000", // 1000 USDC (6 decimals)
      6,
      "500000000000000000", // 0.5 WETH (18 decimals)
      18,
    )

    expect(rate).toBe(2000)
  })
})

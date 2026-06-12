import { Task } from "@dreamx-development/hodlbonds-blockchain-executor-dto"
import { TransactionResponse } from "ethers"
import { vi, describe, it, expect } from "vitest"

import { ExecutionResult } from "../src/ExecutionResult"

const mockTask = {
  id: 123,
  executor: "MockExecutor",
} as unknown as Task

const mockFunction = vi.fn()
const mockParams = ["ccc", "333"]

describe("ExecutionResult", () => {
  it("isSuccess/getTxHashes/getTxHashes: Throws when result is not processed", () => {
    expect.assertions(3)

    const result = new ExecutionResult(mockTask)

    expect(() => result.isSuccess()).toThrow(
      `isSuccess() called before result has been processed for task ${mockTask.id} / ${mockTask.executor}`,
    )
    expect(() => result.getTxHashes()).toThrow(
      `getTxHashes() called before result has been processed for task ${mockTask.id} / ${mockTask.executor}`,
    )
    expect(() => result.getMessage()).toThrow(
      `getMessage() called before result has been processed for task ${mockTask.id} / ${mockTask.executor}`,
    )
  })
  it("processSingleTransaction: Waits for the correct number of confirmations and seconds", async () => {
    expect.assertions(2)

    const mockTx = {
      wait: vi.fn().mockResolvedValue(null),
    } as unknown as TransactionResponse

    const mockFunction = vi.fn().mockImplementation(() => {
      return new Promise<TransactionResponse>((resolve) => {
        resolve(mockTx) as unknown as TransactionResponse
      })
    })
    const mockParams = ["cba", "321"]

    const confirmations = 22
    const timeout = 333

    const result = new ExecutionResult(mockTask)
    result.transactionConfirmations = confirmations
    result.transactionTimeout = timeout

    await result.processSingleTransaction(mockFunction, mockParams)

    expect(mockTx.wait).toHaveBeenCalledWith(confirmations, timeout)
    expect(mockTx.wait).toBeCalledTimes(1)
  })
  it("processSingleTransaction: Returns failure if no receipt is returned", async () => {
    expect.assertions(2)

    const mockTx = {
      wait: () => Promise.resolve(null),
    } as unknown as TransactionResponse

    mockFunction.mockImplementation(() => {
      return new Promise<TransactionResponse>((resolve) => {
        resolve(mockTx) as unknown as TransactionResponse
      })
    })

    const confirmations = 22
    const timeout = 333 * 1000

    const result = new ExecutionResult(mockTask)
    result.transactionConfirmations = confirmations
    result.transactionTimeout = timeout

    await result.processSingleTransaction(mockFunction, mockParams)

    expect(result.isSuccess()).toBe(false)
    expect(result.getMessage()).toBe(
      `Task ${mockTask.id} ${mockTask.executor} response.wait() didn't get ${confirmations} confirmations and timed out after ${timeout / 1000} seconds`,
    )
  })
  it("processSingleTransaction: Returns failure if exception is thrown during submission", async () => {
    expect.assertions(2)

    const mockExceptionText = "Submission rejected"
    mockFunction.mockRejectedValue(mockExceptionText)

    const result = new ExecutionResult(mockTask)
    await result.processSingleTransaction(mockFunction, mockParams)

    expect(result.isSuccess()).toBe(false)
    expect(result.getMessage()).toBe(
      `Task ${mockTask.id} ${mockTask.executor} got exception while waiting for tx to be MINED: ${mockExceptionText}`,
    )
  })
  it("processSingleTransaction: Handles timeout during function call", async () => {
    expect.assertions(2)

    // Mock a function that takes longer than the timeout
    mockFunction.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(resolve, 2000)
        }),
    )

    const result = new ExecutionResult(mockTask)
    result.transactionTimeout = 50 // Very short timeout

    await result.processSingleTransaction(mockFunction, mockParams)

    expect(result.isSuccess()).toBe(false)
    expect(result.getMessage()).toContain("Timeout")
  })
  it("processSingleTransaction: Returns failure when response is undefined", async () => {
    expect.assertions(2)

    // oxlint-disable-next-line unicorn/no-useless-undefined
    mockFunction.mockResolvedValue(undefined)

    const result = new ExecutionResult(mockTask)
    await result.processSingleTransaction(mockFunction, mockParams)

    expect(result.isSuccess()).toBe(false)
    expect(result.getMessage()).toBe(
      `Task ${mockTask.id} ${mockTask.executor} got no response while waiting for tx to be mined`,
    )
  })
  it("processSingleTransaction: Returns failure if receipt status is 0 (reverted)", async () => {
    expect.assertions(2)

    const mockTx = {
      wait: () => Promise.resolve({ status: 0, hash: "0xabc" }),
    } as unknown as TransactionResponse
    mockFunction.mockImplementation(() => {
      return new Promise<TransactionResponse>((resolve) => {
        resolve(mockTx) as unknown as TransactionResponse
      })
    })

    const result = new ExecutionResult(mockTask)
    await result.processSingleTransaction(mockFunction, mockParams)

    expect(result.isSuccess()).toBe(false)
    expect(result.getMessage()).toBe(
      `Task ${mockTask.id} ${mockTask.executor} transaction reverted (status=0)`,
    )
  })
  it("processSingleTransaction: Returns failure if receipt is received with no tx hash", async () => {
    expect.assertions(2)

    const mockTx = {
      wait: () => Promise.resolve({ hash: null }),
    } as unknown as TransactionResponse
    mockFunction.mockImplementation(() => {
      return new Promise<TransactionResponse>((resolve) => {
        resolve(mockTx) as unknown as TransactionResponse
      })
    })

    const result = new ExecutionResult(mockTask)
    await result.processSingleTransaction(mockFunction, mockParams)

    expect(result.isSuccess()).toBe(false)
    expect(result.getMessage()).toBe(
      `Task ${mockTask.id} ${mockTask.executor} Receipt doesn't contain a hash`,
    )
  })
  it("processSingleTransaction: Returns failure if exception is thrown during confirmation", async () => {
    expect.assertions(2)

    const mockExceptionText = "Some error during confirmation"
    const mockTx = {
      wait: () => Promise.reject(mockExceptionText),
    } as unknown as TransactionResponse
    mockFunction.mockImplementation(() => {
      return new Promise<TransactionResponse>((resolve) => {
        resolve(mockTx) as unknown as TransactionResponse
      })
    })

    const result = new ExecutionResult(mockTask)
    await result.processSingleTransaction(mockFunction, mockParams)

    expect(result.isSuccess()).toBe(false)
    expect(result.getMessage()).toBe(
      `Task ${mockTask.id} ${mockTask.executor} got exception while waiting for tx to be CONFIRMED: ${mockExceptionText}`,
    )
  })
  it("processSingleTransaction: Returns success if receipt is received with tx hash", async () => {
    expect.assertions(3)

    const mockHash = "0x12345"
    const mockTx = {
      wait: () => Promise.resolve({ hash: mockHash }),
    } as unknown as TransactionResponse
    mockFunction.mockImplementation(() => {
      return new Promise<TransactionResponse>((resolve) => {
        resolve(mockTx) as unknown as TransactionResponse
      })
    })

    const result = new ExecutionResult(mockTask)
    await result.processSingleTransaction(mockFunction, mockParams)

    expect(result.isSuccess()).toBe(true)
    expect(result.getMessage()).toBe("Successfully mined")
    expect(result.getTxHashes()).toStrictEqual([mockHash])
  })
})

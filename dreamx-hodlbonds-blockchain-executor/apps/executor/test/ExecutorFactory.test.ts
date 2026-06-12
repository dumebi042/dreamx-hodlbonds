import { Executor } from "@dreamx-development/hodlbonds-blockchain-executor-dto"
import { describe, it, expect, vi } from "vitest"

import type { MerkleTreeManager } from "@/MerkleTreeManager"
import type { ExecutorConfig } from "@/schemas"

import { ExecutorFactory } from "../src/ExecutorFactory"

const mockExecutorConfig: ExecutorConfig = {
  minimumGasPrice: "10",
  maximumPriorityFeePerGas: "5",
  overBidPercent: 125,
}

const mockMerkleTreeManager = vi.fn() as unknown as MerkleTreeManager

describe("ExecutorFactory", () => {
  it("Constructor", () => {
    expect.assertions(1)

    const factory = new ExecutorFactory(mockMerkleTreeManager)

    expect(factory.constructor.name).toBe("ExecutorFactory")
  })

  it("getExecutor: Returns objects of correct class", () => {
    expect.assertions(Object.values(Executor).filter((e) => e !== Executor.UnitTest).length)

    const factory = new ExecutorFactory(mockMerkleTreeManager)

    for (const executorName of Object.values(Executor).filter((e) => e !== Executor.UnitTest)) {
      const obj = factory.getExecutor(executorName as Executor, mockExecutorConfig)
      expect(obj.constructor.name).toBe(executorName)
    }
  })

  it("getExecutor: Throws on unknown executor name", () => {
    expect.assertions(1)

    const factory = new ExecutorFactory(mockMerkleTreeManager)

    /* @ts-expect-error Testing invalid executor name */
    expect(() => factory.getExecutor("UnknownExecutor", mockExecutorConfig)).toThrow(
      "Unknown Executor UnknownExecutor",
    )
  })
})

import { Task } from "@dreamx-development/hodlbonds-blockchain-executor-dto"
import { type Signer, ethers } from "ethers"
import log4js, { type Logger } from "log4js"
import { describe, beforeEach, it, expect, vi } from "vitest"

import type { ExecutorConfig } from "@/schemas"

import { ExecutionResult } from "@/ExecutionResult"
import { ExecutorAbstract } from "@/ExecutorAbstract"

class Wrapper extends ExecutorAbstract {
  override logger: Logger = log4js.getLogger(this.constructor.name)

  /**
   *
   * @param {Task} _task
   * @param {Signer} _signer
   */
  async execute(_task: Task, _signer: Signer): Promise<ExecutionResult> {
    return (await Promise.resolve({})) as unknown as Promise<ExecutionResult>
  }
}

const mockFeePerGasEip1559 = {
  maxFeePerGas: ethers.parseUnits("100", "gwei"),
  maxPriorityFeePerGas: ethers.parseUnits("25", "gwei"),
}
const mockFeePerGasPreEip1559 = { gasPrice: ethers.parseUnits("200", "gwei") }
const mockGetFeeData = vi.fn()
const mockSigner = {
  provider: {
    getFeeData: mockGetFeeData,
  },
} as unknown as Signer

describe("ExecutorAbstract 2", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockGetFeeData.mockResolvedValue(mockFeePerGasEip1559)
  })

  it("calculateGasParameters: Happy path - EIP-1559 adding 25% to the current gas price", async () => {
    expect.assertions(2)

    const mockExecutorConfig: ExecutorConfig = {
      minimumGasPrice: "10",
      maximumPriorityFeePerGas: "5",
      overBidPercent: 125,
    }

    // const spyParseUnits = vi.spyOn(ethers, "parseUnits")
    // const spyToBigInt = vi.spyOn(ethers, "toBigInt")

    const expectedMaxFeePerGas = 125000000000n
    const expectedMaxPriorityFeePerGas = 5000000000n

    const executor = new Wrapper(mockExecutorConfig)
    const result = await executor.calculateGasParameters(mockSigner)

    expect(result).toStrictEqual({
      maxFeePerGas: expectedMaxFeePerGas,
      maxPriorityFeePerGas: expectedMaxPriorityFeePerGas,
    })
    expect(mockGetFeeData).toHaveBeenCalled()
    // expect(spyParseUnits).toHaveBeenCalledExactlyOnceWith(
    //   mockExecutorConfig.minimumGasPrice,
    //   "gwei",
    // )
    // expect(spyToBigInt).toHaveBeenCalledExactlyOnceWith(mockExecutorConfig.overBidPercent)
  })

  it("calculateGasParameters: Happy path - EIP-1559 using minimum gas price", async () => {
    expect.assertions(2)

    const mockExecutorConfig: ExecutorConfig = {
      minimumGasPrice: "10",
      maximumPriorityFeePerGas: "5",
      overBidPercent: 125,
    }

    const mockBaseFeePerGas = {
      maxFeePerGas: ethers.parseUnits("1", "gwei"),
      maxPriorityFeePerGas: ethers.parseUnits("25", "gwei"),
    }
    mockGetFeeData.mockResolvedValue(mockBaseFeePerGas)

    const expectedMaxFeePerGas = 10000000000n
    const expectedMaxPriorityFeePerGas = 5000000000n

    const executor = new Wrapper(mockExecutorConfig)
    const result = await executor.calculateGasParameters(mockSigner)

    expect(result).toStrictEqual({
      maxFeePerGas: expectedMaxFeePerGas,
      maxPriorityFeePerGas: expectedMaxPriorityFeePerGas,
    })
    expect(mockGetFeeData).toHaveBeenCalled()
  })

  it("calculateGasParameters: Happy path - EIP-1559 Fractional gas - adding 25% to the current gas price", async () => {
    expect.assertions(2)

    const mockExecutorConfig: ExecutorConfig = {
      minimumGasPrice: "0.01",
      maximumPriorityFeePerGas: "0.03",
      overBidPercent: 125,
    }

    const mockBaseFeePerGas = {
      maxFeePerGas: ethers.parseUnits("0.1", "gwei"),
      maxPriorityFeePerGas: ethers.parseUnits("25", "gwei"),
    }
    mockGetFeeData.mockResolvedValue(mockBaseFeePerGas)

    // const spyParseUnits = vi.spyOn(ethers, "parseUnits")
    // const spyToBigInt = vi.spyOn(ethers, "toBigInt")

    const expectedMaxFeePerGas = 125000000n
    const expectedMaxPriorityFeePerGas = 30000000n

    const executor = new Wrapper(mockExecutorConfig)
    const result = await executor.calculateGasParameters(mockSigner)

    expect(result).toStrictEqual({
      maxFeePerGas: expectedMaxFeePerGas,
      maxPriorityFeePerGas: expectedMaxPriorityFeePerGas,
    })
    expect(mockGetFeeData).toHaveBeenCalled()
    // expect(spyParseUnits).toHaveBeenCalledExactlyOnceWith(mockExecutorConfig.minimumGasPrice, "gwei")
    // expect(spyToBigInt).toHaveBeenCalledExactlyOnceWith(mockExecutorConfig.overBidPercent)
  })

  it("calculateGasParameters: Happy path - EIP-1559 Fractional gas - using minimum gas price", async () => {
    expect.assertions(2)

    const mockExecutorConfig: ExecutorConfig = {
      minimumGasPrice: "0.001",
      maximumPriorityFeePerGas: "0.003",
      overBidPercent: 125,
    }

    const mockBaseFeePerGas = {
      maxFeePerGas: ethers.parseUnits("0.0001", "gwei"),
      maxPriorityFeePerGas: ethers.parseUnits("25", "gwei"),
    }
    mockGetFeeData.mockResolvedValue(mockBaseFeePerGas)

    const expectedMaxFeePerGas = 1000000n
    const expectedMaxPriorityFeePerGas = 3000000n

    const executor = new Wrapper(mockExecutorConfig)
    const result = await executor.calculateGasParameters(mockSigner)

    expect(result).toStrictEqual({
      maxFeePerGas: expectedMaxFeePerGas,
      maxPriorityFeePerGas: expectedMaxPriorityFeePerGas,
    })
    expect(mockGetFeeData).toHaveBeenCalled()
  })

  it("calculateGasParameters: Happy path - Non EIP-1559 adding 25% to the current gas price", async () => {
    expect.assertions(2)

    const mockExecutorConfig: ExecutorConfig = {
      minimumGasPrice: "10",
      maximumPriorityFeePerGas: "5",
      overBidPercent: 125,
    }

    mockGetFeeData.mockResolvedValue(mockFeePerGasPreEip1559)

    // const spyParseUnits = vi.spyOn(ethers, "parseUnits")
    // const spyToBigInt = vi.spyOn(ethers, "toBigInt")

    const expectedGasPrice = 250000000000n

    const executor = new Wrapper(mockExecutorConfig)
    const result = await executor.calculateGasParameters(mockSigner)

    expect(result).toStrictEqual({ gasPrice: expectedGasPrice })
    expect(mockGetFeeData).toHaveBeenCalled()
    // expect(spyParseUnits).toHaveBeenCalledExactlyOnceWith(mockExecutorConfig.minimumGasPrice, "gwei")
    // expect(spyToBigInt).toHaveBeenCalledExactlyOnceWith(mockExecutorConfig.overBidPercent)
  })

  it("calculateGasParameters: Happy path - Non EIP-1559 using minimum gas price", async () => {
    expect.assertions(2)

    const mockExecutorConfig: ExecutorConfig = {
      minimumGasPrice: "10",
      maximumPriorityFeePerGas: "5",
      overBidPercent: 125,
    }

    const mockBaseFeePerGas = { gasPrice: ethers.parseUnits("1", "gwei") }
    mockGetFeeData.mockResolvedValue(mockBaseFeePerGas)

    const expectedGasPrice = 10000000000n

    const executor = new Wrapper(mockExecutorConfig)
    const result = await executor.calculateGasParameters(mockSigner)

    expect(result).toStrictEqual({ gasPrice: expectedGasPrice })
    expect(mockGetFeeData).toHaveBeenCalledOnce()
  })

  it("calculateGasParameters: Happy path - Non EIP-1559 Fractional gas - adding 25% to the current gas price", async () => {
    expect.assertions(2)

    const mockExecutorConfig: ExecutorConfig = {
      minimumGasPrice: "0.01",
      maximumPriorityFeePerGas: "0.03",
      overBidPercent: 125,
    }

    const mockBaseFeePerGas = { gasPrice: ethers.parseUnits("0.1", "gwei") }
    mockGetFeeData.mockResolvedValue(mockBaseFeePerGas)

    // const spyParseUnits = vi.spyOn(ethers, "parseUnits")
    // const spyToBigInt = vi.spyOn(ethers, "toBigInt")

    const expectedGasPrice = 125000000n

    const executor = new Wrapper(mockExecutorConfig)
    const result = await executor.calculateGasParameters(mockSigner)

    expect(result).toStrictEqual({ gasPrice: expectedGasPrice })
    expect(mockGetFeeData).toHaveBeenCalled()
    // expect(spyParseUnits).toHaveBeenCalledExactlyOnceWith(mockExecutorConfig.minimumGasPrice, "gwei")
    // expect(spyToBigInt).toHaveBeenCalledExactlyOnceWith(mockExecutorConfig.overBidPercent)
  })

  it("calculateGasParameters: Happy path - Non EIP-1559 Fractional gas - using minimum gas price", async () => {
    expect.assertions(2)

    const mockExecutorConfig: ExecutorConfig = {
      minimumGasPrice: "0.001",
      maximumPriorityFeePerGas: "0.003",
      overBidPercent: 125,
    }

    const mockBaseFeePerGas = { gasPrice: ethers.parseUnits("0.0001", "gwei") }
    mockGetFeeData.mockResolvedValue(mockBaseFeePerGas)

    const expectedGasPrice = 1000000n

    const executor = new Wrapper(mockExecutorConfig)
    const result = await executor.calculateGasParameters(mockSigner)

    expect(result).toStrictEqual({ gasPrice: expectedGasPrice })
    expect(mockGetFeeData).toHaveBeenCalledOnce()
  })

  it("calculateGasParameters: No baseFeePerGas returned - throwing", async () => {
    expect.assertions(1)

    const mockExecutorConfig: ExecutorConfig = {
      minimumGasPrice: "10",
      maximumPriorityFeePerGas: "5",
      overBidPercent: 125,
    }

    mockGetFeeData.mockResolvedValue({})

    const executor = new Wrapper(mockExecutorConfig)
    await expect(() => executor.calculateGasParameters(mockSigner)).rejects.toThrow(
      "FeeData doesn't contain 'gasPrice': {}",
    )
  })

  it("calculateGasParameters: Throws when feeData is not available", async () => {
    expect.assertions(1)

    const mockExecutorConfig: ExecutorConfig = {
      minimumGasPrice: "10",
      maximumPriorityFeePerGas: "5",
      overBidPercent: 125,
    }

    mockGetFeeData.mockResolvedValue(null)

    const executor = new Wrapper(mockExecutorConfig)
    await expect(() => executor.calculateGasParameters(mockSigner)).rejects.toThrow(
      "Not able to get feeData",
    )
  })
})

import type {
  BlackholeExactInData,
  HodlBondsTradeData,
  HodlBondsTradeTask,
  LFJExactInData,
  Task,
  UniswapExactInData,
} from "@dreamx-development/hodlbonds-blockchain-executor-dto"

import {
  captureErrorAsync,
  captureZodErrorAsync,
  Executor,
  HodlBondsTradeOp,
  Network,
  Status,
} from "@dreamx-development/hodlbonds-blockchain-executor-dto"
import { type Signer, TransactionResponse } from "ethers"
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest"

import type { MerkleTreeManager } from "@/MerkleTreeManager"
import type { ExecutorConfig } from "@/schemas"

import { HodlBondsTrade } from "@/implementations/HodlBondsTrade"

// Mock TradingApiClient - use vi.hoisted since vi.mock is hoisted
const { mockPublishOrderStatusUpdate, MockTradingApiClient } = vi.hoisted(() => {
  const mockPublishOrderStatusUpdate = vi.fn().mockResolvedValue("mock-message-id")
  const MockTradingApiClient = vi.fn(
    class {
      publishOrderStatusUpdate = mockPublishOrderStatusUpdate
    },
  )
  return { mockPublishOrderStatusUpdate, MockTradingApiClient }
})

vi.mock("@dreamx-development/hodlbonds-blockchain-executor-client", () => ({
  TradingApiClient: MockTradingApiClient,
}))

vi.mock("@/config", () => ({
  baseConfig: {
    TRADING_API_STATUS_TOPIC: "projects/test-project/topics/order-status-updates",
  },
}))

// Use fake timers with a fixed timestamp (only mock Date, not timers)
const MOCK_NOW = 1700000000000 // Nov 14, 2023 in milliseconds
const MOCK_DEADLINE = Math.floor(MOCK_NOW / 1000) + 600 // 1700000600
const MOCK_TIMESTAMP = new Date(MOCK_NOW).toISOString() // "2023-11-14T22:13:20.000Z"
vi.useFakeTimers({ toFake: ["Date"] })
vi.setSystemTime(MOCK_NOW)

// Mock wallet address used by the signer
const mockWalletAddress = "0x742d35cc6634c0532925a3b844bc9e7595f0beb0"

// Mock signer with getAddress method
const mockSigner = {
  getAddress: vi.fn().mockResolvedValue(mockWalletAddress),
} as unknown as Signer

// Mock MerkleTreeManager
const mockMerkleProof = [
  "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
  "0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
]

const mockMerkleTreeManager = {
  generateProof: vi.fn().mockReturnValue(mockMerkleProof),
  getRoot: vi.fn().mockReturnValue("0x" + "0".repeat(64)),
  verifyProof: vi.fn().mockReturnValue(true),
  getWalletAddresses: vi.fn().mockReturnValue([mockWalletAddress]),
} as unknown as MerkleTreeManager

const mockExecutorConfig: ExecutorConfig = {
  minimumGasPrice: "10",
  maximumPriorityFeePerGas: "5",
  overBidPercent: 125,
}

const mockBaseTask = {
  id: 1,
  status: Status.QUEUED,
  priority: 100,
  earliest_try_unix: 1000000000,
  latest_try_unix: null,
  should_retry: true,
  attempts: 0,
  next_attempt_unix: 0,
  network: Network.tst,
  executor: Executor.HodlBondsTrade,
}

const mockFromTask = vi.fn()
vi.mock(import("@dreamx-development/hodlbonds-blockchain-executor-dto"), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    HodlBondsTradeTaskTask: {
      fromTask: (task: Task) => mockFromTask(task),
    } as typeof HodlBondsTradeTask,
  }
})

describe("HodlBondsTrade", () => {
  it("execute: Generates and includes Merkle proof for executor wallet", async () => {
    expect.assertions(2)

    const mockTaskTrade = {
      ...mockBaseTask,
      data: {
        op: HodlBondsTradeOp.UNISWAP_EXACT_IN,
        clientOrderId: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
        poolAddress: "0x1234567890abcdef1234567890abcdef12345678",
        quantity: "1000",
        minAmountOut: "950",
        deadline: MOCK_DEADLINE,
        zeroForOne: true,
      } satisfies HodlBondsTradeData,
    } as unknown as HodlBondsTradeTask

    const mockGasParameters = { parameterA: 123, parameterB: "abc" }
    const mockTrade = vi
      .fn()
      .mockReturnValue("Some response" as unknown as Promise<TransactionResponse>)

    const hodlBondsTrade = new HodlBondsTrade(mockExecutorConfig, mockMerkleTreeManager)
    hodlBondsTrade.getContract = vi.fn().mockResolvedValue({
      swapExactInputSingle: mockTrade,
    })
    hodlBondsTrade.singleTransactionResult = vi.fn()
    hodlBondsTrade.calculateGasParameters = vi.fn().mockResolvedValue(mockGasParameters)

    await hodlBondsTrade.execute(mockTaskTrade, mockSigner)

    // Verify signer address is retrieved
    expect(mockSigner.getAddress).toHaveBeenCalledOnce()

    // Verify proof is generated with correct wallet address
    expect(mockMerkleTreeManager.generateProof).toHaveBeenCalledExactlyOnceWith(mockWalletAddress)
  })

  it("execute: Calls Uniswap contract with the correct parameters", async () => {
    expect.assertions(3)

    const mockTaskTrade = {
      ...mockBaseTask,
      data: {
        op: HodlBondsTradeOp.UNISWAP_EXACT_IN,
        clientOrderId: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
        poolAddress: "0x1234567890abcdef1234567890abcdef12345678",
        quantity: "1000",
        minAmountOut: "950",
        deadline: MOCK_DEADLINE,
        zeroForOne: true,
      } satisfies HodlBondsTradeData,
    } as unknown as HodlBondsTradeTask

    const mockGasParameters = { parameterA: 123, parameterB: "abc" }
    const mockCalculateGasParameters = vi.fn().mockResolvedValue(mockGasParameters)

    const mockResponseUpdateTrade = "Some response trade" as unknown as Promise<TransactionResponse>
    const mockTrade = vi.fn().mockReturnValue(mockResponseUpdateTrade)

    const hodlBondsTrade = new HodlBondsTrade(mockExecutorConfig, mockMerkleTreeManager)
    const typedData = mockTaskTrade.data as UniswapExactInData
    hodlBondsTrade.getContract = vi.fn().mockResolvedValue({
      swapExactInputSingle: mockTrade,
    })
    hodlBondsTrade.singleTransactionResult = vi.fn()
    hodlBondsTrade.calculateGasParameters = mockCalculateGasParameters

    await hodlBondsTrade.execute(mockTaskTrade, mockSigner)

    expect(hodlBondsTrade.getContract).toHaveBeenCalledExactlyOnceWith(
      "Vault",
      Network.tst,
      mockSigner,
      mockTaskTrade.data.poolAddress,
    )

    expect(hodlBondsTrade.calculateGasParameters).toHaveBeenCalledExactlyOnceWith(mockSigner)

    expect(hodlBondsTrade.singleTransactionResult).toHaveBeenCalledExactlyOnceWith(
      mockTaskTrade,
      mockTrade,
      [
        typedData.quantity,
        typedData.minAmountOut,
        typedData.deadline,
        typedData.zeroForOne,
        mockMerkleProof,
        mockGasParameters,
      ],
    )
  })

  it("execute: Throws on missing Uniswap contract function", async () => {
    expect.assertions(2)

    const mockTaskTrade = {
      ...mockBaseTask,
      data: {
        op: HodlBondsTradeOp.UNISWAP_EXACT_IN,
        clientOrderId: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
        poolAddress: "0x1234567890abcdef1234567890abcdef12345678",
        quantity: "1000",
        minAmountOut: "950",
        deadline: MOCK_DEADLINE, // 10 minutes from now
        zeroForOne: true,
      } satisfies HodlBondsTradeData,
    } as unknown as HodlBondsTradeTask

    const hodlBondsTrade = new HodlBondsTrade(mockExecutorConfig, mockMerkleTreeManager)
    hodlBondsTrade.getContract = vi.fn().mockResolvedValue({
      mockFunction: vi.fn(),
    })

    const err = (await captureErrorAsync(
      async () => await hodlBondsTrade.execute(mockTaskTrade, mockSigner),
    )) as Error

    expect(hodlBondsTrade.getContract).toHaveBeenCalledExactlyOnceWith(
      "Vault",
      Network.tst,
      mockSigner,
      mockTaskTrade.data.poolAddress,
    )
    expect(err.message).toBe(`Contract missing method swapExactInputSingle`)
  })

  it("execute: Calls LFJ contract with the correct parameters", async () => {
    expect.assertions(3)

    const mockTaskTrade = {
      ...mockBaseTask,
      data: {
        op: HodlBondsTradeOp.LFJ_EXACT_IN,
        clientOrderId: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
        poolAddress: "0x1234567890abcdef1234567890abcdef12345678",
        quantity: "1000",
        minAmountOut: "950",
        inputToken: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
        deadline: MOCK_DEADLINE, // 10 minutes from now
      } satisfies HodlBondsTradeData,
    } as unknown as HodlBondsTradeTask

    const mockGasParameters = { parameterA: 123, parameterB: "abc" }
    const mockCalculateGasParameters = vi.fn().mockResolvedValue(mockGasParameters)

    const mockResponseUpdateTrade = "Some response trade" as unknown as Promise<TransactionResponse>
    const mockTrade = vi.fn().mockReturnValue(mockResponseUpdateTrade)

    const hodlBondsTrade = new HodlBondsTrade(mockExecutorConfig, mockMerkleTreeManager)
    const typedData = mockTaskTrade.data as LFJExactInData
    hodlBondsTrade.getContract = vi.fn().mockResolvedValue({
      lbSwapExactInputSingle: mockTrade,
    })
    hodlBondsTrade.singleTransactionResult = vi.fn()
    hodlBondsTrade.calculateGasParameters = mockCalculateGasParameters

    await hodlBondsTrade.execute(mockTaskTrade, mockSigner)

    expect(hodlBondsTrade.getContract).toHaveBeenCalledExactlyOnceWith(
      "Vault",
      Network.tst,
      mockSigner,
      mockTaskTrade.data.poolAddress,
    )

    expect(hodlBondsTrade.calculateGasParameters).toHaveBeenCalledExactlyOnceWith(mockSigner)

    expect(hodlBondsTrade.singleTransactionResult).toHaveBeenCalledExactlyOnceWith(
      mockTaskTrade,
      mockTrade,
      [
        typedData.quantity,
        typedData.minAmountOut,
        typedData.inputToken,
        typedData.deadline,
        mockMerkleProof,
        mockGasParameters,
      ],
    )
  })

  it("execute: Throws on missing LFJ contract function", async () => {
    expect.assertions(2)

    const mockTaskTrade = {
      ...mockBaseTask,
      data: {
        op: HodlBondsTradeOp.LFJ_EXACT_IN,
        clientOrderId: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
        poolAddress: "0x1234567890abcdef1234567890abcdef12345678",
        quantity: "1000",
        minAmountOut: "950",
        inputToken: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
        deadline: MOCK_DEADLINE, // 10 minutes from now
      } satisfies HodlBondsTradeData,
    } as unknown as HodlBondsTradeTask

    const hodlBondsTrade = new HodlBondsTrade(mockExecutorConfig, mockMerkleTreeManager)
    hodlBondsTrade.getContract = vi.fn().mockResolvedValue({
      mockFunction: vi.fn(),
    })

    const err = (await captureErrorAsync(
      async () => await hodlBondsTrade.execute(mockTaskTrade, mockSigner),
    )) as Error

    expect(hodlBondsTrade.getContract).toHaveBeenCalledExactlyOnceWith(
      "Vault",
      Network.tst,
      mockSigner,
      mockTaskTrade.data.poolAddress,
    )
    expect(err.message).toBe(`Contract missing method lbSwapExactInputSingle`)
  })

  it("execute: Calls Blackhole contract with the correct parameters", async () => {
    expect.assertions(3)

    const mockTaskTrade = {
      ...mockBaseTask,
      data: {
        op: HodlBondsTradeOp.BLACKHOLE_EXACT_IN,
        clientOrderId: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
        poolAddress: "0x1234567890abcdef1234567890abcdef12345678",
        quantity: "1000",
        minAmountOut: "950",
        inputToken: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
        deadline: MOCK_DEADLINE, // 10 minutes from now
      } satisfies HodlBondsTradeData,
    } as unknown as HodlBondsTradeTask

    const mockGasParameters = { parameterA: 123, parameterB: "abc" }
    const mockCalculateGasParameters = vi.fn().mockResolvedValue(mockGasParameters)

    const mockResponseUpdateTrade = "Some response trade" as unknown as Promise<TransactionResponse>
    const mockTrade = vi.fn().mockReturnValue(mockResponseUpdateTrade)

    const hodlBondsTrade = new HodlBondsTrade(mockExecutorConfig, mockMerkleTreeManager)
    const typedData = mockTaskTrade.data as BlackholeExactInData
    hodlBondsTrade.getContract = vi.fn().mockResolvedValue({
      blackholeSwapExactInputSingle: mockTrade,
    })
    hodlBondsTrade.singleTransactionResult = vi.fn()
    hodlBondsTrade.calculateGasParameters = mockCalculateGasParameters

    await hodlBondsTrade.execute(mockTaskTrade, mockSigner)

    expect(hodlBondsTrade.getContract).toHaveBeenCalledExactlyOnceWith(
      "Vault",
      Network.tst,
      mockSigner,
      mockTaskTrade.data.poolAddress,
    )

    expect(hodlBondsTrade.calculateGasParameters).toHaveBeenCalledExactlyOnceWith(mockSigner)

    expect(hodlBondsTrade.singleTransactionResult).toHaveBeenCalledExactlyOnceWith(
      mockTaskTrade,
      mockTrade,
      [
        typedData.quantity,
        typedData.minAmountOut,
        typedData.inputToken,
        typedData.deadline,
        mockMerkleProof,
        mockGasParameters,
      ],
    )
  })

  it("execute: Throws on missing Blackhole contract function", async () => {
    expect.assertions(2)

    const mockTaskTrade = {
      ...mockBaseTask,
      data: {
        op: HodlBondsTradeOp.BLACKHOLE_EXACT_IN,
        clientOrderId: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
        poolAddress: "0x1234567890abcdef1234567890abcdef12345678",
        quantity: "1000",
        minAmountOut: "950",
        inputToken: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
        deadline: MOCK_DEADLINE, // 10 minutes from now
      } satisfies HodlBondsTradeData,
    } as unknown as HodlBondsTradeTask

    const hodlBondsTrade = new HodlBondsTrade(mockExecutorConfig, mockMerkleTreeManager)
    hodlBondsTrade.getContract = vi.fn().mockResolvedValue({
      mockFunction: vi.fn(),
    })

    const err = (await captureErrorAsync(
      async () => await hodlBondsTrade.execute(mockTaskTrade, mockSigner),
    )) as Error

    expect(hodlBondsTrade.getContract).toHaveBeenCalledExactlyOnceWith(
      "Vault",
      Network.tst,
      mockSigner,
      mockTaskTrade.data.poolAddress,
    )
    expect(err.message).toBe(`Contract missing method blackholeSwapExactInputSingle`)
  })

  it("execute: Throws error for unknown operation", async () => {
    expect.assertions(2)

    const mockTaskUnknownOp = {
      id: 1,
      status: Status.QUEUED,
      priority: 100,
      earliest_try_unix: 1000000000,
      latest_try_unix: null,
      should_retry: true,
      attempts: 0,
      next_attempt_unix: 0,
      network: Network.tst,
      executor: Executor.HodlBondsTrade,
      data: {
        op: "UNKNOWN_TASK" as HodlBondsTradeOp,
        clientOrderId: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
        poolAddress: "0x1234567890abcdef1234567890abcdef12345678",
        quantity: "1000",
        minAmountOut: "950",
        deadline: MOCK_DEADLINE, // 10 minutes from now
        zeroForOne: true,
      } as HodlBondsTradeData,
    } as unknown as HodlBondsTradeTask
    const hodlBondsTrade = new HodlBondsTrade(mockExecutorConfig, mockMerkleTreeManager)
    hodlBondsTrade.getContract = vi.fn().mockResolvedValue({})

    const err = await captureZodErrorAsync(
      async () => await hodlBondsTrade.execute(mockTaskUnknownOp, mockSigner),
    )
    expect(err.issues[0]?.path[0]).toBe("op")
    expect(err.issues[0]?.message).toMatch("Invalid input")
  })

  describe("lifecycle hooks", () => {
    const mockClientOrderId = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4"
    const mockTxHash = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"

    const mockTaskWithClientOrderId = {
      ...mockBaseTask,
      data: {
        op: HodlBondsTradeOp.UNISWAP_EXACT_IN,
        clientOrderId: mockClientOrderId,
        poolAddress: "0x1234567890abcdef1234567890abcdef12345678",
        quantity: "1000",
        minAmountOut: "950",
        deadline: MOCK_DEADLINE,
        zeroForOne: true,
      } satisfies HodlBondsTradeData,
    } as unknown as Task

    beforeEach(() => {
      vi.clearAllMocks()
      // Reset the static singleton between tests
      // @ts-expect-error - accessing private static property for testing
      HodlBondsTrade.tradingApiClient = undefined
    })

    afterEach(() => {
      // Clean up singleton after each test
      // @ts-expect-error - accessing private static property for testing
      HodlBondsTrade.tradingApiClient = undefined
    })

    describe("getTradingApiClient", () => {
      it("creates singleton TradingApiClient on first call", async () => {
        expect.assertions(1)

        const hodlBondsTrade = new HodlBondsTrade(mockExecutorConfig, mockMerkleTreeManager)
        await hodlBondsTrade.onTaskStarted(mockTaskWithClientOrderId)

        expect(MockTradingApiClient).toHaveBeenCalledExactlyOnceWith(
          "projects/test-project/topics/order-status-updates",
        )
      })

      it("reuses singleton TradingApiClient on subsequent calls", async () => {
        expect.assertions(1)

        const hodlBondsTrade1 = new HodlBondsTrade(mockExecutorConfig, mockMerkleTreeManager)
        const hodlBondsTrade2 = new HodlBondsTrade(mockExecutorConfig, mockMerkleTreeManager)

        await hodlBondsTrade1.onTaskStarted(mockTaskWithClientOrderId)
        await hodlBondsTrade2.onTaskStarted(mockTaskWithClientOrderId)
        await hodlBondsTrade1.onTaskFailed(mockTaskWithClientOrderId)

        // Singleton means only one instantiation despite multiple hooks called
        expect(MockTradingApiClient).toHaveBeenCalledTimes(1)
      })
    })

    describe("onTaskStarted", () => {
      it("publishes pending status update", async () => {
        expect.assertions(1)

        const hodlBondsTrade = new HodlBondsTrade(mockExecutorConfig, mockMerkleTreeManager)

        await hodlBondsTrade.onTaskStarted(mockTaskWithClientOrderId)

        expect(mockPublishOrderStatusUpdate).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({
            clientOrderId: mockClientOrderId,
            status: "pending",
            timestamp: MOCK_TIMESTAMP,
          }),
        )
      })

      it("does not include txHash in pending status", async () => {
        expect.assertions(1)

        const hodlBondsTrade = new HodlBondsTrade(mockExecutorConfig, mockMerkleTreeManager)

        await hodlBondsTrade.onTaskStarted(mockTaskWithClientOrderId)

        const callArg = mockPublishOrderStatusUpdate.mock.calls[0]?.[0]
        expect(callArg).not.toHaveProperty("txHash")
      })
    })

    describe("onTaskExecuted", () => {
      it("publishes executed status update with txHash", async () => {
        expect.assertions(1)

        const hodlBondsTrade = new HodlBondsTrade(mockExecutorConfig, mockMerkleTreeManager)

        await hodlBondsTrade.onTaskExecuted(mockTaskWithClientOrderId, mockTxHash)

        expect(mockPublishOrderStatusUpdate).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({
            clientOrderId: mockClientOrderId,
            status: "executed",
            timestamp: MOCK_TIMESTAMP,
            txHash: mockTxHash,
          }),
        )
      })
    })

    describe("onTaskRetry", () => {
      it("publishes retry status update", async () => {
        expect.assertions(1)

        const hodlBondsTrade = new HodlBondsTrade(mockExecutorConfig, mockMerkleTreeManager)

        await hodlBondsTrade.onTaskRetry(mockTaskWithClientOrderId)

        expect(mockPublishOrderStatusUpdate).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({
            clientOrderId: mockClientOrderId,
            status: "retry",
            timestamp: MOCK_TIMESTAMP,
          }),
        )
      })

      it("does not include txHash in retry status", async () => {
        expect.assertions(1)

        const hodlBondsTrade = new HodlBondsTrade(mockExecutorConfig, mockMerkleTreeManager)

        await hodlBondsTrade.onTaskRetry(mockTaskWithClientOrderId)

        const callArg = mockPublishOrderStatusUpdate.mock.calls[0]?.[0]
        expect(callArg).not.toHaveProperty("txHash")
      })
    })

    describe("onTaskFailed", () => {
      it("publishes failed status update", async () => {
        expect.assertions(1)

        const hodlBondsTrade = new HodlBondsTrade(mockExecutorConfig, mockMerkleTreeManager)

        await hodlBondsTrade.onTaskFailed(mockTaskWithClientOrderId)

        expect(mockPublishOrderStatusUpdate).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({
            clientOrderId: mockClientOrderId,
            status: "failed",
            timestamp: MOCK_TIMESTAMP,
          }),
        )
      })

      it("does not include txHash in failed status", async () => {
        expect.assertions(1)

        const hodlBondsTrade = new HodlBondsTrade(mockExecutorConfig, mockMerkleTreeManager)

        await hodlBondsTrade.onTaskFailed(mockTaskWithClientOrderId)

        const callArg = mockPublishOrderStatusUpdate.mock.calls[0]?.[0]
        expect(callArg).not.toHaveProperty("txHash")
      })
    })

    describe("publishUpdate error handling", () => {
      it("propagates errors from TradingApiClient", async () => {
        expect.assertions(1)

        const mockError = new Error("PubSub publish failed")
        mockPublishOrderStatusUpdate.mockRejectedValueOnce(mockError)

        const hodlBondsTrade = new HodlBondsTrade(mockExecutorConfig, mockMerkleTreeManager)

        await expect(hodlBondsTrade.onTaskStarted(mockTaskWithClientOrderId)).rejects.toThrow(
          "PubSub publish failed",
        )
      })
    })
  })
})

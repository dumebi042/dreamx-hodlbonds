import {
  type DcaBotFixedBuyOrder,
  type DcaBotFixedData,
  DcaBotFixedTask,
  Executor,
  Network,
  Status,
  Task,
} from "@dreamx-development/hodlbonds-blockchain-executor-dto"
import { Contract, type Signer } from "ethers"
import { vi, describe, beforeEach, it, expect } from "vitest"

import { DcaBotFixed } from "@/implementations/DcaBot/DcaBotFixed"
import { type ExecutorConfig } from "@/schemas"

const mockSigner = "Mock Signer" as unknown as Signer

const mockExecutorConfig: ExecutorConfig = {
  minimumGasPrice: "10",
  maximumPriorityFeePerGas: "5",
  overBidPercent: 125,
}

const mockToken0fn = vi.fn()
const mockGetReserves = vi.fn()
const mockPairContract = {
  token0: mockToken0fn,
  getReserves: mockGetReserves,
}

const mockGetPair = vi.fn()
const mockUniFactory = {
  getPair: mockGetPair,
} as unknown as Contract

describe("DCA Bot Fixed amount", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockGetPair.mockResolvedValue(mockPairContract)
  })
  it("processDcaTask: Happy path", async () => {
    expect.assertions(5)

    const mockBuyOrders: DcaBotFixedBuyOrder[] = [
      {
        active: true,
        address: `0x${"B".repeat(40)}`,
        tokenToSellAmount: 100,
        decimals: 18,
      },
      {
        active: false,
        address: `0x${"C".repeat(40)}`,
        tokenToSellAmount: 200,
        decimals: 18,
      },
      {
        active: true,
        address: `0x${"D".repeat(40)}`,
        tokenToSellAmount: 300,
        decimals: 18,
      },
    ]
    const mockDcaFixedData: DcaBotFixedData = {
      tokenToSell: `0x${"A".repeat(40)}`,
      tokenToSellDecimals: 18,
      buyOrders: mockBuyOrders,
    }

    const mockDcaFixedTask = new Task({
      id: 1,
      status: Status.QUEUED,
      priority: 100,
      earliest_try_unix: 1234567890,
      latest_try_unix: 1234567890,
      should_retry: true,
      attempts: 0,
      next_attempt_unix: 1234567890,
      network: Network.tst,
      executor: Executor.DcaBotFixed,
      data: mockDcaFixedData,
    })

    const mockAmountTokensToBuy = [100, 200]

    const dcaBotFixed = new DcaBotFixed(mockExecutorConfig)
    dcaBotFixed.getContract = vi.fn().mockResolvedValue(mockUniFactory)
    dcaBotFixed.processBuyOrder = vi
      .fn()
      .mockResolvedValueOnce(mockAmountTokensToBuy[0])
      .mockResolvedValueOnce(mockAmountTokensToBuy[1])

    const expectedResult = {
      fromAddresses: [mockDcaFixedData.tokenToSell, mockDcaFixedData.tokenToSell],
      toAddresses: [mockBuyOrders[0]!.address, mockBuyOrders[2]!.address],
      tokenAmountsPerRun: [mockAmountTokensToBuy[0], mockAmountTokensToBuy[1]],
    }

    const result = await dcaBotFixed.processDcaTask(mockDcaFixedTask, mockSigner)

    expect(result).toStrictEqual(expectedResult)
    expect(dcaBotFixed.getContract).toBeCalledWith("UniswapV2Factory", Network.tst, mockSigner)
    expect(dcaBotFixed.processBuyOrder).toBeCalledTimes(2)
    expect(dcaBotFixed.processBuyOrder).toHaveBeenNthCalledWith(
      1,
      mockUniFactory,
      mockBuyOrders[0],
      mockSigner,
      mockDcaFixedTask,
    )
    expect(dcaBotFixed.processBuyOrder).toHaveBeenNthCalledWith(
      2,
      mockUniFactory,
      mockBuyOrders[2],
      mockSigner,
      mockDcaFixedTask,
    )
  })
  it("processBuyOrder: Selling 18 decimal Jewel for 6 decimal oUSDT", async () => {
    expect.assertions(2)

    const mockTokenToSell = "0xJEWEL"
    const mockTokenToSellDecimals = 18
    const mockReserveJewel = 100000000000000000000n // 100

    const mockTokenToBuy = "0xAVAX"
    const mockTokenToBuyDecimals = 6
    const mockReserveAvax = 10000000n // 10

    const mockTokenToSellAmount = 20 // 20 Jewel

    const expectedTokensToBuy = 2000000n // 2 0xAVAX

    const mockDcaFixedTask = {
      network: Network.tst,
      data: {
        tokenToSell: mockTokenToSell,
        tokenToSellDecimals: mockTokenToSellDecimals,
      },
    } as unknown as DcaBotFixedTask

    const mockBuyOrder = {
      address: mockTokenToBuy,
      tokenToSellAmount: mockTokenToSellAmount,
      active: true,
      decimals: mockTokenToBuyDecimals,
    } as DcaBotFixedBuyOrder

    mockToken0fn.mockResolvedValueOnce(mockTokenToSell).mockResolvedValueOnce(mockTokenToBuy)

    mockGetReserves
      .mockResolvedValueOnce([mockReserveJewel, mockReserveAvax])
      .mockResolvedValueOnce([mockReserveAvax, mockReserveJewel])

    const dcaBotFixed = new DcaBotFixed(mockExecutorConfig)
    dcaBotFixed.getContract = mockGetPair

    const actualResult1 = await dcaBotFixed.processBuyOrder(
      mockUniFactory,
      mockBuyOrder,
      mockSigner,
      mockDcaFixedTask,
    )
    const actualResult2 = await dcaBotFixed.processBuyOrder(
      mockUniFactory,
      mockBuyOrder,
      mockSigner,
      mockDcaFixedTask,
    )

    expect(actualResult1).toBe(expectedTokensToBuy)
    expect(actualResult2).toBe(expectedTokensToBuy)
  })
  it("processBuyOrder: Selling Fractional 18 decimal Jewel for 6 decimal oUSDT", async () => {
    expect.assertions(2)

    const mockTokenToSell = "0xJEWEL"
    const mockTokenToSellDecimals = 18
    const mockReserveJewel = 100000000000000000000n // 100

    const mockTokenToBuy = "0xAVAX"
    const mockTokenToBuyDecimals = 6
    const mockReserveAvax = 10000000n // 10

    const mockTokenToSellAmount = 0.2 // 0.2 Jewel

    const expectedTokensToBuy = 20000n // 0.02 0xAVAX

    const mockDcaFixedTask = {
      network: Network.tst,
      data: {
        tokenToSell: mockTokenToSell,
        tokenToSellDecimals: mockTokenToSellDecimals,
      },
    } as unknown as DcaBotFixedTask

    const mockBuyOrder = {
      address: mockTokenToBuy,
      tokenToSellAmount: mockTokenToSellAmount,
      active: true,
      decimals: mockTokenToBuyDecimals,
    } as DcaBotFixedBuyOrder

    mockToken0fn.mockResolvedValueOnce(mockTokenToSell).mockResolvedValueOnce(mockTokenToBuy)

    mockGetReserves
      .mockResolvedValueOnce([mockReserveJewel, mockReserveAvax])
      .mockResolvedValueOnce([mockReserveAvax, mockReserveJewel])

    const dcaBotFixed = new DcaBotFixed(mockExecutorConfig)
    dcaBotFixed.getContract = mockGetPair

    const actualResult1 = await dcaBotFixed.processBuyOrder(
      mockUniFactory,
      mockBuyOrder,
      mockSigner,
      mockDcaFixedTask,
    )
    const actualResult2 = await dcaBotFixed.processBuyOrder(
      mockUniFactory,
      mockBuyOrder,
      mockSigner,
      mockDcaFixedTask,
    )

    expect(actualResult1).toBe(expectedTokensToBuy)
    expect(actualResult2).toBe(expectedTokensToBuy)
  })
})

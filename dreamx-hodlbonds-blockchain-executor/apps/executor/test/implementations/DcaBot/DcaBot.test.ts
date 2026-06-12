import {
  type DcaBotBuyOrder,
  type DcaBotData,
  DcaBotTask,
  Executor,
  Network,
  Status,
  Task,
} from "@dreamx-development/hodlbonds-blockchain-executor-dto"
import { Contract, type Signer } from "ethers"
import { vi, describe, beforeEach, it, expect } from "vitest"

import type { ExecutorConfig } from "@/schemas"

import { DcaBot } from "@/implementations/DcaBot/DcaBot"

const mockExecutorConfig: ExecutorConfig = {
  minimumGasPrice: "10",
  maximumPriorityFeePerGas: "5",
  overBidPercent: 125,
}

const mockSigner = "mock signer" as unknown as Signer

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

describe("DCA Bot", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockGetPair.mockResolvedValue(mockPairContract)
  })
  it("processDcaTask: Happy path", async () => {
    expect.assertions(6)

    const mockBuyOrders: DcaBotBuyOrder[] = [
      {
        active: true,
        address: `0x${"B".repeat(40)}`,
        dollarAmount: 10,
        decimals: 18,
      },
      {
        active: false,
        address: `0x${"C".repeat(40)}`,
        dollarAmount: 20,
        decimals: 18,
      },
      {
        active: true,
        address: `0x${"D".repeat(40)}`,
        dollarAmount: 30,
        decimals: 18,
      },
    ]
    const mockDcaBotData: DcaBotData = {
      tokenToSell: `0x${"A".repeat(40)}`,
      tokenToSellDecimals: 18,
      baseDollarToken: `0x${"E".repeat(40)}`,
      baseDollarDecimals: 6,
      buyOrders: mockBuyOrders,
    }
    const mockDcaTask = new Task({
      id: 1,
      status: Status.QUEUED,
      priority: 100,
      earliest_try_unix: 1234567890,
      latest_try_unix: 1234567890,
      should_retry: true,
      attempts: 0,
      next_attempt_unix: 1234567890,
      network: Network.tst,
      executor: Executor.DcaBot,
      data: mockDcaBotData,
    })

    const mockTokenToSellDollarPrice = 0.5
    const mockAmountTokensToBuy = [100, 200]

    const dcaBot = new DcaBot(mockExecutorConfig)
    dcaBot.getContract = vi.fn().mockResolvedValue(mockUniFactory)
    dcaBot.getTokenToSellDollarPrice = vi.fn().mockResolvedValue(mockTokenToSellDollarPrice)
    dcaBot.processBuyOrder = vi
      .fn()
      .mockResolvedValueOnce(mockAmountTokensToBuy[0])
      .mockResolvedValueOnce(mockAmountTokensToBuy[1])

    const expectedResult = {
      fromAddresses: [mockDcaBotData.tokenToSell, mockDcaBotData.tokenToSell],
      toAddresses: [mockBuyOrders[0]!.address, mockBuyOrders[2]!.address],
      tokenAmountsPerRun: [mockAmountTokensToBuy[0], mockAmountTokensToBuy[1]],
    }

    const result = await dcaBot.processDcaTask(mockDcaTask, mockSigner)

    expect(result).toStrictEqual(expectedResult)
    expect(dcaBot.getContract).toBeCalledWith("UniswapV2Factory", Network.tst, mockSigner)
    expect(dcaBot.getTokenToSellDollarPrice).toBeCalledWith(mockDcaTask, mockSigner, mockUniFactory)
    expect(dcaBot.processBuyOrder).toBeCalledTimes(2)
    expect(dcaBot.processBuyOrder).nthCalledWith(
      1,
      mockUniFactory,
      mockBuyOrders[0],
      mockSigner,
      mockTokenToSellDollarPrice,
      mockDcaTask,
    )
    expect(dcaBot.processBuyOrder).nthCalledWith(
      2,
      mockUniFactory,
      mockBuyOrders[2],
      mockSigner,
      mockTokenToSellDollarPrice,
      mockDcaTask,
    )
  })
  it("processBuyOrder: Selling 18 decimal Jewel for 6 decimal oUSDT", async () => {
    expect.assertions(6)

    const mockDollarAmount = 12
    const mockTokenToSellDollarPrice = 0.5

    const mockJewel = "0xJewel"
    const mockJewelDecimals = 18
    const mockJewelReserves = 200000000000000000000n // 200

    const mockOusdt = "0xoUSDT"
    const mockOusdtDecimals = 6
    const mockOusdtReserves = 100000000n // 100

    const expectedTokensToBuy = 12000000n // $12 of Jewel is 12 * 10^6 of oUSDT

    mockToken0fn.mockResolvedValueOnce(mockJewel).mockResolvedValueOnce(mockOusdt)

    mockGetReserves
      .mockResolvedValueOnce([mockJewelReserves, mockOusdtReserves])
      .mockResolvedValueOnce([mockOusdtReserves, mockJewelReserves])

    const mockLpAddress = "0xLpAddress"
    mockGetPair.mockReturnValue(mockLpAddress)

    const mockBuyOrder = {
      address: mockOusdt,
      dollarAmount: mockDollarAmount,
      decimals: mockOusdtDecimals,
    } as unknown as DcaBotBuyOrder

    const mockDcaTask = {
      network: Network.tst,
      data: {
        tokenToSell: mockJewel,
        tokenToSellDecimals: mockJewelDecimals,
      },
    } as unknown as DcaBotTask

    const dcaBot = new DcaBot(mockExecutorConfig)
    dcaBot.getContract = vi.fn().mockResolvedValue(mockPairContract)

    const resultToken0 = await dcaBot.processBuyOrder(
      mockUniFactory,
      mockBuyOrder,
      mockSigner,
      mockTokenToSellDollarPrice,
      mockDcaTask,
    )
    expect(resultToken0).toBe(expectedTokensToBuy)
    expect(mockGetPair).nthCalledWith(1, mockJewel, mockBuyOrder.address)
    expect(dcaBot.getContract).nthCalledWith(
      1,
      "UniswapV2Pair",
      Network.tst,
      mockSigner,
      mockLpAddress,
    )

    const resultToken1 = await dcaBot.processBuyOrder(
      mockUniFactory,
      mockBuyOrder,
      mockSigner,
      mockTokenToSellDollarPrice,
      mockDcaTask,
    )
    expect(resultToken1).toBe(expectedTokensToBuy)
    expect(mockGetPair).nthCalledWith(2, mockJewel, mockBuyOrder.address)
    expect(dcaBot.getContract).nthCalledWith(
      2,
      "UniswapV2Pair",
      Network.tst,
      mockSigner,
      mockLpAddress,
    )
  })
  it("processBuyOrder: Selling Fractional 18 decimal Jewel for 6 decimal oUSDT", async () => {
    expect.assertions(6)

    const mockDollarAmount = 0.12
    const mockTokenToSellDollarPrice = 0.005

    const mockJewel = "0xJewel"
    const mockJewelDecimals = 18
    const mockJewelReserves = 200000000000000000000n // 200

    const mockOusdt = "0xoUSDT"
    const mockOusdtDecimals = 6
    const mockOusdtReserves = 100000000n // 100

    const expectedTokensToBuy = 12000000n // $12 of Jewel is 12 * 10^6 of oUSDT

    mockToken0fn.mockResolvedValueOnce(mockJewel).mockResolvedValueOnce(mockOusdt)

    mockGetReserves
      .mockResolvedValueOnce([mockJewelReserves, mockOusdtReserves])
      .mockResolvedValueOnce([mockOusdtReserves, mockJewelReserves])

    const mockLpAddress = "0xLpAddress"
    mockGetPair.mockReturnValue(mockLpAddress)

    const mockBuyOrder = {
      address: mockOusdt,
      dollarAmount: mockDollarAmount,
      decimals: mockOusdtDecimals,
    } as unknown as DcaBotBuyOrder

    const mockDcaTask = {
      network: Network.tst,
      data: {
        tokenToSell: mockJewel,
        tokenToSellDecimals: mockJewelDecimals,
      },
    } as unknown as DcaBotTask

    const dcaBot = new DcaBot(mockExecutorConfig)
    dcaBot.getContract = vi.fn().mockResolvedValue(mockPairContract)

    const resultToken0 = await dcaBot.processBuyOrder(
      mockUniFactory,
      mockBuyOrder,
      mockSigner,
      mockTokenToSellDollarPrice,
      mockDcaTask,
    )
    expect(resultToken0).toBe(expectedTokensToBuy)
    expect(mockGetPair).nthCalledWith(1, mockJewel, mockBuyOrder.address)
    expect(dcaBot.getContract).nthCalledWith(
      1,
      "UniswapV2Pair",
      Network.tst,
      mockSigner,
      mockLpAddress,
    )

    const resultToken1 = await dcaBot.processBuyOrder(
      mockUniFactory,
      mockBuyOrder,
      mockSigner,
      mockTokenToSellDollarPrice,
      mockDcaTask,
    )
    expect(resultToken1).toBe(expectedTokensToBuy)
    expect(mockGetPair).nthCalledWith(2, mockJewel, mockBuyOrder.address)
    expect(dcaBot.getContract).nthCalledWith(
      2,
      "UniswapV2Pair",
      Network.tst,
      mockSigner,
      mockLpAddress,
    )
  })
  it("getTokenToSellDollarPrice: 6 decimals oUSDT, 18 decimals JEWEL", async () => {
    expect.assertions(10)

    const mockTokenToSell = "0xJEWEL"
    const mockTokenToSellDecimals = 18
    const mockReserveJewel = 100000000000000000000n // 100

    const mockBaseDollarToken = "0xoUSDT"
    const mockBaseDollarDecimals = 6
    const mockReserveOusdt = 10000000n // 10

    const expectedJewelPrice = 0.1

    const mockPairAddress = "0xPair"
    const mockDcaTask = {
      network: Network.tst,
      data: {
        tokenToSell: mockTokenToSell,
        tokenToSellDecimals: mockTokenToSellDecimals,
        baseDollarToken: mockBaseDollarToken,
        baseDollarDecimals: mockBaseDollarDecimals,
      },
    } as unknown as DcaBotTask

    mockGetPair.mockResolvedValue(mockPairAddress)
    mockToken0fn.mockResolvedValueOnce(mockTokenToSell).mockResolvedValueOnce(mockBaseDollarToken)
    mockGetReserves
      .mockResolvedValueOnce([mockReserveJewel, mockReserveOusdt])
      .mockResolvedValueOnce([mockReserveOusdt, mockReserveJewel])

    const dcaBot = new DcaBot(mockExecutorConfig)
    dcaBot.getContract = vi.fn().mockResolvedValue(mockPairContract)

    const resultToken0IsTokenToSell = await dcaBot.getTokenToSellDollarPrice(
      mockDcaTask,
      mockSigner,
      mockUniFactory,
    )
    const resultToken0IsBaseDollarToken = await dcaBot.getTokenToSellDollarPrice(
      mockDcaTask,
      mockSigner,
      mockUniFactory,
    )

    expect(resultToken0IsTokenToSell).toBe(expectedJewelPrice)
    expect(resultToken0IsBaseDollarToken).toBe(expectedJewelPrice)

    expect(mockGetPair).toBeCalledTimes(2)
    expect(mockGetPair).toHaveBeenNthCalledWith(1, mockTokenToSell, mockBaseDollarToken)
    expect(mockGetPair).toHaveBeenNthCalledWith(2, mockTokenToSell, mockBaseDollarToken)

    expect(dcaBot.getContract).toBeCalledTimes(2)
    expect(dcaBot.getContract).toHaveBeenNthCalledWith(
      1,
      "UniswapV2Pair",
      Network.tst,
      mockSigner,
      mockPairAddress,
    )
    expect(dcaBot.getContract).toHaveBeenNthCalledWith(
      2,
      "UniswapV2Pair",
      Network.tst,
      mockSigner,
      mockPairAddress,
    )

    expect(mockToken0fn).toBeCalledTimes(2)
    expect(mockGetReserves).toBeCalledTimes(2)
  })
})

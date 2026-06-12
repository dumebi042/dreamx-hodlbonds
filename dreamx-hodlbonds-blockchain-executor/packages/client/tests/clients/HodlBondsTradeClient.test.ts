import type {
  HodlBondsTradeData,
  HodlBondsTradeMessage,
} from "@dreamx-development/hodlbonds-blockchain-executor-dto"

import {
  Executor,
  HodlBondsTradeOp,
  Network,
} from "@dreamx-development/hodlbonds-blockchain-executor-dto"
import process from "node:process"
import { describe, it, expect, vi } from "vitest"

import { HodlBondsTradeClient } from "@/clients/HodlBondsTradeClient"

process.env["EXECUTOR_PUBSUB_TOPIC"] = "projects/blockchain-executor/topics/some-topic"

describe("HodlBondsTradeClient", () => {
  it("constructor: Able to instantiate", () => {
    expect.assertions(1)

    expect(() => new HodlBondsTradeClient()).not.toThrow()
  })

  it("publishHodlBondsTradeUpdate: Happy path", async () => {
    expect.assertions(2)

    const mockHodlBondsTradeData: HodlBondsTradeData = {
      op: HodlBondsTradeOp.UNISWAP_EXACT_IN,
      clientOrderId: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
      poolAddress: "0x1234567890abcdef1234567890abcdef12345678",
      quantity: "1000000000000000000",
      minAmountOut: "500000000000000000",
      deadline: 1711929600,
      zeroForOne: true,
    }

    const expectedMessage: HodlBondsTradeMessage = {
      data: mockHodlBondsTradeData,
      earliestTry: expect.anything(),
      latestTry: expect.anything(),
      executor: Executor.HodlBondsTrade,
      network: Network.tst,
      priority: 100,
      shouldRetry: true,
    }

    const mockMessageId = "333444555"

    const client = new HodlBondsTradeClient()
    client.publishMessage = vi.fn().mockResolvedValueOnce(mockMessageId)

    const actualMessageId = await client.publishHodlBondsTradeUpdate(
      Network.tst,
      mockHodlBondsTradeData,
    )
    expect(client.publishMessage).toBeCalledWith(expectedMessage)
    expect(actualMessageId).toBe(mockMessageId)
  })
})

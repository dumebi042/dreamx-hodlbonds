import {
  DcaBotFixedMessage,
  DcaBotMessage,
  Executor,
  HodlBondsTradeMessage,
  HodlBondsTradeOp,
  Message,
} from "@dreamx-development/hodlbonds-blockchain-executor-dto"
import { describe, it, expect } from "vitest"

import { MessageFactory } from "@/MessageFactory"

import { regularMessage } from "./__testdata__/intake-data"

describe("MessageFactory", () => {
  it("constructor: Creates a factory on valid input", () => {
    expect.assertions(1)

    const factory = new MessageFactory(Executor.UnitTest)

    expect(factory.constructor.name).toBe("MessageFactory")
  })

  it("constructor: Throws on invalid input", () => {
    expect.assertions(1)

    const invalidExecutor = "InvalidExecutor" as unknown as Executor

    expect(() => new MessageFactory(invalidExecutor)).toThrow(
      `Unknown Executor: ${invalidExecutor}`,
    )
  })

  it("createMessage: Creates different message types based on executor", () => {
    expect.assertions(9)

    const dcaBotFactory = new MessageFactory(Executor.DcaBot)
    const dcaBotMessage = dcaBotFactory.createMessage({
      ...regularMessage,
      data: {
        tokenToSell: "0x0000000000000000000000000000000000000000",
        tokenToSellDecimals: 18,
        baseDollarToken: "0x0000000000000000000000000000000000000000",
        baseDollarDecimals: 6,
        buyOrders: [
          {
            address: "0x0000000000000000000000000000000000000000",
            dollarAmount: 100,
            active: true,
            decimals: 18,
          },
        ],
      },
    } satisfies DcaBotMessage)
    expect(dcaBotMessage.constructor.name).toBe("DcaBotMessage")
    expect(dcaBotMessage instanceof DcaBotMessage).toBe(true)
    expect(dcaBotMessage instanceof Message).toBe(true)

    const dcaBotFixedFactory = new MessageFactory(Executor.DcaBotFixed)
    const dcaBotFixedMessage = dcaBotFixedFactory.createMessage({
      ...regularMessage,
      data: {
        tokenToSell: "0x0000000000000000000000000000000000000000",
        tokenToSellDecimals: 18,
        buyOrders: [
          {
            address: "0x0000000000000000000000000000000000000000",
            tokenToSellAmount: 100,
            active: true,
            decimals: 18,
          },
        ],
      },
    } satisfies DcaBotFixedMessage)
    expect(dcaBotFixedMessage.constructor.name).toBe("DcaBotFixedMessage")
    expect(dcaBotFixedMessage instanceof DcaBotFixedMessage).toBe(true)
    expect(dcaBotFixedMessage instanceof Message).toBe(true)

    const hodlBondsFactory = new MessageFactory(Executor.HodlBondsTrade)
    const hodlBondsMessage = hodlBondsFactory.createMessage({
      ...regularMessage,
      data: {
        op: HodlBondsTradeOp.UNISWAP_EXACT_IN,
        clientOrderId: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
        poolAddress: "0x1234567890123456789012345678901234567890",
        quantity: "1000000000000000000",
        minAmountOut: "900000000000000000",
        deadline: 1716239023,
        zeroForOne: false,
      },
    } satisfies HodlBondsTradeMessage)
    expect(hodlBondsMessage.constructor.name).toBe("HodlBondsTradeMessage")
    expect(hodlBondsMessage instanceof HodlBondsTradeMessage).toBe(true)
    expect(hodlBondsMessage instanceof Message).toBe(true)
  })

  it("createMessage: Returns a Message on valid input", () => {
    expect.assertions(1)

    const factory = new MessageFactory(Executor.UnitTest)

    const message = factory.createMessage(regularMessage)

    expect(message instanceof Message).toBe(true)
  })

  it("createMessage: Handles special timestamp values (-1 and relative times)", () => {
    expect.assertions(3)

    const factory = new MessageFactory(Executor.UnitTest)

    // Test earliestTry: -1 (should use current time)
    const messageWithCurrentTime = factory.createMessage({
      ...regularMessage,
      earliestTry: -1,
    })
    expect(messageWithCurrentTime.earliestTry).toBeGreaterThan(1600000000) // Should be a recent timestamp

    // Test latestTry: relative time (< 1000000000)
    const messageWithRelativeTime = factory.createMessage({
      ...regularMessage,
      latestTry: 3600, // 1 hour from now
    })
    expect(messageWithRelativeTime.latestTry).toBeGreaterThan(Date.now() / 1000)

    // Test latestTry: null
    const messageWithNoDeadline = factory.createMessage({
      ...regularMessage,
      latestTry: null,
    })
    expect(messageWithNoDeadline.latestTry).toBe(null)
  })

  it("createMessage: Throws on unknown executor", () => {
    expect.assertions(1)

    const factory = new MessageFactory(Executor.UnitTest)
    factory.executor = "UnknownExecutor" as Executor

    expect(() => factory.createMessage(regularMessage)).toThrow(
      `Message for unknown executor: ${regularMessage.executor}`,
    )
  })
})

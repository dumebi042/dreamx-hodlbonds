import { Network, HodlBondsTradeOp } from "@dreamx-development/hodlbonds-blockchain-executor-dto"
import { describe, expect, test } from "vitest"

import { HodlBondsTradeClient } from "@/index"

const topic = "projects/blockchain-executor/topics/LOCAL_TESTING_TOPIC"

process.env["GOOGLE_APPLICATION_CREDENTIALS"] = "/path/to/credentials-dba.json"

describe("Local Testing with Live Topic", () => {
  test("Complete a swap", { skip: true }, async () => {
    const client = new HodlBondsTradeClient(topic)

    const messageId = await client.publishHodlBondsTradeUpdate(Network.eth, {
      op: HodlBondsTradeOp.UNISWAP_EXACT_IN,
      clientOrderId: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
      poolAddress: "0x1234567890abcdef1234567890abcdef12345678",
      quantity: "1000000000000000000",
      minAmountOut: "500000000000000000",
      deadline: 1711929600,
      zeroForOne: true,
    })
    console.log(messageId)
    expect(messageId).toBeTruthy()
  })
})

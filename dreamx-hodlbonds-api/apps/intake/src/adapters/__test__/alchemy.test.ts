/**
 * Tests for Alchemy adapter
 * Verifies transformation of Alchemy webhook payloads to standardized Log format
 */

import { getAddress, type Address, type Hex } from "viem"
import { describe, expect, it } from "vitest"

import { buildAlchemyPayload } from "@/test/helpers/alchemy-builders"

import { AlchemyTransformError, transformAlchemyPayload } from "../alchemy"

describe("transformAlchemyPayload", () => {
  it("transforms single log payload to standardized Log format", () => {
    const chainId = 1
    const payload = buildAlchemyPayload()

    const logs = transformAlchemyPayload(payload, chainId)

    expect(logs).toHaveLength(1)

    const log = logs[0]!
    const alchemyLog = payload.event.data.block.logs[0]!
    const block = payload.event.data.block

    // Verify all fields are correctly transformed
    expect(log.address).toBe(getAddress(alchemyLog.account.address))
    expect(log.topics).toEqual(alchemyLog.topics)
    expect(log.data).toBe(alchemyLog.data)
    expect(log.blockNumber).toBe(BigInt(block.number))
    expect(log.blockHash).toBe(block.hash)
    expect(log.blockTimestamp).toBe(BigInt(block.timestamp))
    expect(log.transactionHash).toBe(alchemyLog.transaction.hash)
    expect(log.transactionIndex).toBe(alchemyLog.transaction.index)
    expect(log.logIndex).toBe(alchemyLog.index)
    expect(log.chainId).toBe(chainId)
  })

  it("transforms multiple logs in a single payload", () => {
    const chainId = 137 // Polygon
    const payload = buildAlchemyPayload({
      logs: [
        buildAlchemyPayload().event.data.block.logs[0]!,
        buildAlchemyPayload().event.data.block.logs[0]!,
        buildAlchemyPayload().event.data.block.logs[0]!,
      ],
    })

    const logs = transformAlchemyPayload(payload, chainId)

    expect(logs).toHaveLength(3)

    // Verify each log has the correct chainId and comes from same block
    logs.forEach((log) => {
      expect(log.chainId).toBe(chainId)
      expect(log.blockNumber).toBe(BigInt(payload.event.data.block.number))
      expect(log.blockHash).toBe(payload.event.data.block.hash)
      expect(log.blockTimestamp).toBe(BigInt(payload.event.data.block.timestamp))
    })
  })

  it("normalizes addresses with proper checksumming", () => {
    const chainId = 1
    // Real USDC contract address on Ethereum mainnet, provided in lowercase
    const checksummedAddress = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
    const lowercaseAddress = checksummedAddress.toLowerCase() as Address

    const payload = buildAlchemyPayload({
      logs: [
        {
          ...buildAlchemyPayload().event.data.block.logs[0]!,
          account: { address: lowercaseAddress },
        },
      ],
    })

    const logs = transformAlchemyPayload(payload, chainId)
    expect(logs[0]!.address).toBe(checksummedAddress)
    expect(logs[0]!.address).not.toBe(lowercaseAddress)
  })

  it("correctly converts block number and timestamp to BigInt", () => {
    const chainId = 1
    const payload = buildAlchemyPayload({
      overrides: {
        event: {
          data: {
            block: {
              ...buildAlchemyPayload().event.data.block,
              number: 12345678,
              timestamp: 1705680000,
            },
          },
        },
      },
    })

    const logs = transformAlchemyPayload(payload, chainId)

    expect(logs[0]!.blockNumber).toBe(12345678n)
    expect(logs[0]!.blockTimestamp).toBe(1705680000n)
  })

  it("preserves log topics and data without modification", () => {
    const chainId = 1
    const expectedTopics = [
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      "0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321",
    ] as Hex[]
    const expectedData = "0xdeadbeef"

    const payload = buildAlchemyPayload({
      logs: [
        {
          ...buildAlchemyPayload().event.data.block.logs[0]!,
          topics: expectedTopics,
          data: expectedData,
        },
      ],
    })

    const logs = transformAlchemyPayload(payload, chainId)

    expect(logs[0]!.topics).toEqual(expectedTopics)
    expect(logs[0]!.data).toBe(expectedData)
  })

  describe("validation errors", () => {
    it("throws AlchemyTransformError for missing block data", () => {
      const payload = { webhookId: "test", id: "test", event: {} }

      expect(() => transformAlchemyPayload(payload as any, 1)).toThrow(AlchemyTransformError)
      expect(() => transformAlchemyPayload(payload as any, 1)).toThrow("Invalid payload")
    })

    it("throws AlchemyTransformError for invalid address format", () => {
      const payload = buildAlchemyPayload({
        logs: [
          {
            ...buildAlchemyPayload().event.data.block.logs[0]!,
            account: { address: "not-an-address" as unknown as Address },
          },
        ],
      })

      expect(() => transformAlchemyPayload(payload as any, 1)).toThrow(AlchemyTransformError)
      expect(() => transformAlchemyPayload(payload as any, 1)).toThrow("Invalid payload")
    })

    it("throws AlchemyTransformError for invalid transaction hash", () => {
      const payload = buildAlchemyPayload({
        logs: [
          {
            ...buildAlchemyPayload().event.data.block.logs[0]!,
            transaction: {
              ...buildAlchemyPayload().event.data.block.logs[0]!.transaction,
              hash: "0xinvalid" as unknown as Hex,
            },
          },
        ],
      })

      expect(() => transformAlchemyPayload(payload as any, 1)).toThrow(AlchemyTransformError)
    })

    it("throws AlchemyTransformError for invalid topic format", () => {
      const payload = buildAlchemyPayload({
        logs: [
          {
            ...buildAlchemyPayload().event.data.block.logs[0]!,
            topics: ["not-a-valid-topic"] as unknown as [`0x${string}`],
          },
        ],
      })

      expect(() => transformAlchemyPayload(payload as any, 1)).toThrow(AlchemyTransformError)
    })
  })
})

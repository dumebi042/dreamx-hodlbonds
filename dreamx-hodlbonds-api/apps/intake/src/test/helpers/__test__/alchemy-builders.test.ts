/**
 * Tests for alchemy-builders test utilities
 * Verifies Alchemy payload generation
 */

import { decodeEventLog, parseAbi } from "viem"
import { describe, expect, it } from "vitest"

import {
  buildAlchemyLog,
  buildAlchemyLogFromEvent,
  buildAlchemyPayload,
  buildAlchemyPayloadFromEvent,
} from "../alchemy-builders"

// Simple test ABI
const testAbi = parseAbi([
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 amount)",
  "event VaultCreated(address indexed vault, address indexed issuer, uint256 vaultId, uint256 bondPrice)",
])

describe("alchemy-builders", () => {
  describe("buildAlchemyLog", () => {
    it("creates a valid random log", () => {
      const log = buildAlchemyLog()

      expect(log).toHaveProperty("account.address")
      expect(log.account.address).toMatch(/^0x[a-fA-F0-9]{40}$/)
      expect(log.topics).toHaveLength(2)
      expect(log.data).toMatch(/^0x/)
      expect(log.index).toBeGreaterThanOrEqual(0)
      expect(log.transaction).toHaveProperty("hash")
    })

    it("applies overrides", () => {
      const log = buildAlchemyLog({
        index: 42,
        account: { address: "0x1234567890123456789012345678901234567890" },
      })

      expect(log.index).toBe(42)
      expect(log.account.address).toBe("0x1234567890123456789012345678901234567890")
    })
  })

  describe("buildAlchemyPayload", () => {
    it("creates a valid random payload", () => {
      const payload = buildAlchemyPayload()

      expect(payload.webhookId).toMatch(/^wh_/)
      expect(payload.type).toBe("GRAPHQL")
      expect(payload.event.data.block.logs).toHaveLength(1)
      expect(payload.sequenceNumber).toHaveLength(16)
    })

    it("accepts custom logs", () => {
      const log1 = buildAlchemyLog({ index: 0 })
      const log2 = buildAlchemyLog({ index: 1 })

      const payload = buildAlchemyPayload({
        logs: [log1, log2],
      })

      expect(payload.event.data.block.logs).toHaveLength(2)
      expect(payload.event.data.block.logs[0]?.index).toBe(0)
      expect(payload.event.data.block.logs[1]?.index).toBe(1)
    })

    it("applies overrides", () => {
      const payload = buildAlchemyPayload({
        overrides: { webhookId: "wh_test123" },
      })

      expect(payload.webhookId).toBe("wh_test123")
    })
  })

  describe("buildAlchemyLogFromEvent", () => {
    it("creates log with encoded event data", () => {
      const from = "0x1111111111111111111111111111111111111111" as const
      const to = "0x2222222222222222222222222222222222222222" as const
      const value = 1000n
      const contractAddress = "0x3333333333333333333333333333333333333333" as const

      const log = buildAlchemyLogFromEvent({
        abi: testAbi,
        eventName: "Transfer",
        args: { from, to, value },
        contractAddress,
      })

      expect(log.account.address).toBe(contractAddress)
      expect(log.topics).toHaveLength(3)
      expect(log.data).not.toBe("0x")

      // Verify by decoding
      const decoded = decodeEventLog({
        abi: testAbi,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
        data: log.data as `0x${string}`,
      })

      expect(decoded.eventName).toBe("Transfer")
      expect(decoded.args).toEqual({ from, to, value })
    })

    it("applies overrides while preserving encoded data", () => {
      const log = buildAlchemyLogFromEvent({
        abi: testAbi,
        eventName: "Transfer",
        args: {
          from: "0x1111111111111111111111111111111111111111",
          to: "0x2222222222222222222222222222222222222222",
          value: 1000n,
        },
        overrides: {
          index: 99,
          transaction: {
            hash: "0xabcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234",
            nonce: 5,
            index: 2,
            from: { address: "0x4444444444444444444444444444444444444444" },
            to: { address: "0x5555555555555555555555555555555555555555" },
            value: "0",
            // gasPrice: "1000000000",
            // gas: 21000,
            // status: 1,
            // gasUsed: 21000,
            // cumulativeGasUsed: 21000,
            // effectiveGasPrice: "1000000000",
            // type: 2,
          },
        },
      })

      expect(log.index).toBe(99)
      expect(log.transaction.hash).toBe(
        "0xabcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234",
      )

      // Event encoding should still be valid
      const decoded = decodeEventLog({
        abi: testAbi,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
        data: log.data as `0x${string}`,
      })
      expect(decoded.eventName).toBe("Transfer")
    })
  })

  describe("buildAlchemyPayloadFromEvent", () => {
    it("creates payload with single encoded event", () => {
      const payload = buildAlchemyPayloadFromEvent({
        abi: testAbi,
        eventName: "Transfer",
        args: {
          from: "0x1111111111111111111111111111111111111111",
          to: "0x2222222222222222222222222222222222222222",
          value: 1000n,
        },
        contractAddress: "0x3333333333333333333333333333333333333333",
      })

      expect(payload.event.data.block.logs).toHaveLength(1)

      const log = payload.event.data.block.logs[0]!
      const decoded = decodeEventLog({
        abi: testAbi,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
        data: log.data as `0x${string}`,
      })

      expect(decoded.eventName).toBe("Transfer")
      expect(log.account.address).toBe("0x3333333333333333333333333333333333333333")
    })

    it("applies both log and payload overrides", () => {
      const payload = buildAlchemyPayloadFromEvent({
        abi: testAbi,
        eventName: "Transfer",
        args: {
          from: "0x1111111111111111111111111111111111111111",
          to: "0x2222222222222222222222222222222222222222",
          value: 1000n,
        },
        logOverrides: { index: 5 },
        payloadOverrides: { webhookId: "wh_custom" },
      })

      expect(payload.webhookId).toBe("wh_custom")
      expect(payload.event.data.block.logs[0]!.index).toBe(5)
    })
  })

  describe("complex scenario: multiple events in one payload", () => {
    it("builds payload with Transfer and Approval events", () => {
      const transferLog = buildAlchemyLogFromEvent({
        abi: testAbi,
        eventName: "Transfer",
        args: {
          from: "0x1111111111111111111111111111111111111111",
          to: "0x2222222222222222222222222222222222222222",
          value: 1000n,
        },
        overrides: { index: 0 },
      })

      const approvalLog = buildAlchemyLogFromEvent({
        abi: testAbi,
        eventName: "Approval",
        args: {
          owner: "0x1111111111111111111111111111111111111111",
          spender: "0x3333333333333333333333333333333333333333",
          amount: 500n,
        },
        overrides: { index: 1 },
      })

      const payload = buildAlchemyPayload({
        logs: [transferLog, approvalLog],
      })

      expect(payload.event.data.block.logs).toHaveLength(2)

      // Verify first log is Transfer
      const decoded1 = decodeEventLog({
        abi: testAbi,
        topics: payload.event.data.block.logs[0]!.topics as [`0x${string}`, ...`0x${string}`[]],
        data: payload.event.data.block.logs[0]!.data as `0x${string}`,
      })
      expect(decoded1.eventName).toBe("Transfer")

      // Verify second log is Approval
      const decoded2 = decodeEventLog({
        abi: testAbi,
        topics: payload.event.data.block.logs[1]!.topics as [`0x${string}`, ...`0x${string}`[]],
        data: payload.event.data.block.logs[1]!.data as `0x${string}`,
      })
      expect(decoded2.eventName).toBe("Approval")
    })
  })
})

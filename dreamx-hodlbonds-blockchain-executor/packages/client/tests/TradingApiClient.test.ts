import { PubSub } from "@google-cloud/pubsub"
import { beforeEach, describe, expect, it, vi, type MockedClass } from "vitest"

import { TradingApiClient } from "@/TradingApiClient"

const mockPublishMessage = vi.fn(() => Promise.resolve("mock-message-id"))
const mockTopic = vi.fn().mockReturnValue({
  publishMessage: mockPublishMessage,
})

vi.mock("@google-cloud/pubsub", () => {
  return {
    PubSub: vi.fn().mockImplementation(function () {
      return {
        topic: mockTopic,
      }
    }),
  }
})

const mockTopicPath = "projects/my-project-id/topics/order-status-updates"

const validUpdate = {
  clientOrderId: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
  status: "pending" as const,
  timestamp: "2026-02-11T12:00:00.000Z",
}

describe("TradingApiClient", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("constructor", () => {
    it("creates instance and initializes PubSub", () => {
      expect.assertions(3)

      const client = new TradingApiClient(mockTopicPath)

      expect(client).toBeInstanceOf(TradingApiClient)

      const mockPubSubInstance = PubSub as MockedClass<typeof PubSub>
      expect(mockPubSubInstance).toHaveBeenCalledTimes(1)
      expect(mockPubSubInstance).toHaveBeenCalledWith()
    })
  })

  describe("publishOrderStatusUpdate", () => {
    it("publishes valid update without txHash", async () => {
      expect.assertions(4)

      const client = new TradingApiClient(mockTopicPath)
      const messageId = await client.publishOrderStatusUpdate(validUpdate)

      expect(mockTopic).toHaveBeenCalledWith(mockTopicPath)
      expect(mockPublishMessage).toHaveBeenCalledTimes(1)
      expect(mockPublishMessage).toHaveBeenCalledWith({
        data: Buffer.from(JSON.stringify(validUpdate)),
      })
      expect(messageId).toBe("mock-message-id")
    })

    it("publishes valid update with txHash", async () => {
      expect.assertions(3)

      const updateWithTxHash = {
        ...validUpdate,
        status: "executed" as const,
        txHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      }

      const client = new TradingApiClient(mockTopicPath)
      const messageId = await client.publishOrderStatusUpdate(updateWithTxHash)

      expect(mockTopic).toHaveBeenCalledWith(mockTopicPath)
      expect(mockPublishMessage).toHaveBeenCalledWith({
        data: Buffer.from(JSON.stringify(updateWithTxHash)),
      })
      expect(messageId).toBe("mock-message-id")
    })

    it("publishes update with all valid status values", async () => {
      expect.assertions(5)

      const client = new TradingApiClient(mockTopicPath)
      const statuses = ["submitted", "pending", "retry", "executed", "failed"] as const

      for (const status of statuses) {
        const update = { ...validUpdate, status }
        // oxlint-disable-next-line no-await-in-loop
        await expect(client.publishOrderStatusUpdate(update)).resolves.toBe("mock-message-id")
      }
    })

    describe("validation errors", () => {
      it("throws on clientOrderId with wrong length (too short)", async () => {
        expect.assertions(1)

        const client = new TradingApiClient(mockTopicPath)
        const invalidUpdate = {
          ...validUpdate,
          clientOrderId: "abc123", // Too short
        }

        await expect(client.publishOrderStatusUpdate(invalidUpdate)).rejects.toThrow(
          /Too small.*32 characters/i,
        )
      })

      it("throws on clientOrderId with wrong length (too long)", async () => {
        expect.assertions(1)

        const client = new TradingApiClient(mockTopicPath)
        const invalidUpdate = {
          ...validUpdate,
          clientOrderId: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4extra", // Too long
        }

        await expect(client.publishOrderStatusUpdate(invalidUpdate)).rejects.toThrow(
          /Too big.*32 characters/i,
        )
      })

      it("throws on clientOrderId with invalid characters (not hex)", async () => {
        expect.assertions(1)

        const client = new TradingApiClient(mockTopicPath)
        const invalidUpdate = {
          ...validUpdate,
          clientOrderId: "g1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4", // 'g' is not hex
        }

        await expect(client.publishOrderStatusUpdate(invalidUpdate)).rejects.toThrow(
          "Must be a valid UUID4 without hyphens",
        )
      })

      it("throws on clientOrderId with hyphens (UUID format)", async () => {
        expect.assertions(1)

        const client = new TradingApiClient(mockTopicPath)
        const invalidUpdate = {
          ...validUpdate,
          clientOrderId: "a1b2c3d4-e5f6-a1b2-c3d4-e5f6a1b2c3d4", // Has hyphens
        }

        await expect(client.publishOrderStatusUpdate(invalidUpdate)).rejects.toThrow(
          /Too big.*32 characters/i,
        )
      })

      it("throws on invalid status", async () => {
        expect.assertions(1)

        const client = new TradingApiClient(mockTopicPath)
        const invalidUpdate = {
          ...validUpdate,
          status: "invalid-status",
        }

        await expect(
          client.publishOrderStatusUpdate(invalidUpdate as any),
        ).rejects.toThrow(/Invalid option/i)
      })

      it("throws on invalid timestamp format", async () => {
        expect.assertions(1)

        const client = new TradingApiClient(mockTopicPath)
        const invalidUpdate = {
          ...validUpdate,
          timestamp: "not-a-timestamp",
        }

        await expect(client.publishOrderStatusUpdate(invalidUpdate)).rejects.toThrow(
          /Invalid ISO datetime/i,
        )
      })

      it("throws on invalid timestamp (not ISO format)", async () => {
        expect.assertions(1)

        const client = new TradingApiClient(mockTopicPath)
        const invalidUpdate = {
          ...validUpdate,
          timestamp: "02/11/2026 12:00:00", // US date format, not ISO
        }

        await expect(client.publishOrderStatusUpdate(invalidUpdate)).rejects.toThrow(
          /Invalid ISO datetime/i,
        )
      })

      it("throws on invalid txHash format (missing 0x prefix)", async () => {
        expect.assertions(1)

        const client = new TradingApiClient(mockTopicPath)
        const invalidUpdate = {
          ...validUpdate,
          txHash: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        }

        await expect(client.publishOrderStatusUpdate(invalidUpdate)).rejects.toThrow(
          "Must be a valid transaction hash",
        )
      })

      it("throws on invalid txHash format (wrong length)", async () => {
        expect.assertions(1)

        const client = new TradingApiClient(mockTopicPath)
        const invalidUpdate = {
          ...validUpdate,
          txHash: "0x1234", // Too short
        }

        await expect(client.publishOrderStatusUpdate(invalidUpdate)).rejects.toThrow(
          "Must be a valid transaction hash",
        )
      })

      it("throws on invalid txHash format (invalid characters)", async () => {
        expect.assertions(1)

        const client = new TradingApiClient(mockTopicPath)
        const invalidUpdate = {
          ...validUpdate,
          txHash: "0xghij567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        }

        await expect(client.publishOrderStatusUpdate(invalidUpdate)).rejects.toThrow(
          "Must be a valid transaction hash",
        )
      })

      it("throws on missing required field (clientOrderId)", async () => {
        expect.assertions(1)

        const client = new TradingApiClient(mockTopicPath)
        const invalidUpdate = {
          status: "pending" as const,
          timestamp: "2026-02-11T12:00:00.000Z",
        }

        await expect(
          client.publishOrderStatusUpdate(invalidUpdate as any),
        ).rejects.toThrow(/required|expected string/i)
      })

      it("throws on missing required field (status)", async () => {
        expect.assertions(1)

        const client = new TradingApiClient(mockTopicPath)
        const invalidUpdate = {
          clientOrderId: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
          timestamp: "2026-02-11T12:00:00.000Z",
        }

        await expect(
          client.publishOrderStatusUpdate(invalidUpdate as any),
        ).rejects.toThrow(/Invalid option/i)
      })

      it("throws on missing required field (timestamp)", async () => {
        expect.assertions(1)

        const client = new TradingApiClient(mockTopicPath)
        const invalidUpdate = {
          clientOrderId: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
          status: "pending" as const,
        }

        await expect(
          client.publishOrderStatusUpdate(invalidUpdate as any),
        ).rejects.toThrow(/expected string, received undefined/i)
      })
    })
  })
})

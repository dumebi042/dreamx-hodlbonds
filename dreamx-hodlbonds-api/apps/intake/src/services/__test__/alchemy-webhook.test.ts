/**
 * Integration tests for Alchemy webhook service
 * These tests run through the full pipeline: signature validation → transform → route
 * No internal mocking - uses real event encoding and database
 */

import { dualTokenVaultAbi } from "@hodlbonds-api/blockchain"
import { getDb } from "@hodlbonds-api/db"
import { intakeEvents } from "@hodlbonds-api/db/schema/index"
import crypto from "node:crypto"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import * as eventHandlers from "@/lib/event-handlers"
import {
  buildAlchemyPayload,
  buildAlchemyPayloadFromEvent,
  buildAlchemyLog,
} from "@/test/helpers/alchemy-builders"

import { processAlchemyWebhook } from "../alchemy-webhook"

/**
 * Generate a valid HMAC SHA256 signature for a payload
 */
function generateSignature(body: string, signingKey: string): string {
  const hmac = crypto.createHmac("sha256", signingKey)
  hmac.update(body, "utf8")
  return hmac.digest("hex")
}

const db = getDb()

const TEST_SIGNING_KEY = "test-signing-key-12345"
const TEST_SIGNING_KEYS = { test: TEST_SIGNING_KEY }
const TEST_CHAIN_ID = 43114 // Avalanche

describe("processAlchemyWebhook", () => {
  let mockHandler: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    // Clean database before each test
    await db.delete(intakeEvents)

    // Mock handler to avoid calling real handlers (which may have external dependencies)
    mockHandler = vi.fn().mockResolvedValue(null)
    vi.spyOn(eventHandlers, "getEventHandler").mockReturnValue(
      mockHandler as ReturnType<typeof eventHandlers.getEventHandler>,
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("signature validation", () => {
    it("throws 'Missing signature' when signature is undefined", async () => {
      const payload = buildAlchemyPayload()
      const rawBody = JSON.stringify(payload)

      await expect(
        processAlchemyWebhook(rawBody, undefined, TEST_SIGNING_KEYS, TEST_CHAIN_ID),
      ).rejects.toThrow("Missing signature")
    })

    it("throws 'Invalid signature' when signature doesn't match", async () => {
      const payload = buildAlchemyPayload()
      const rawBody = JSON.stringify(payload)
      const invalidSignature = "invalid-signature-that-wont-match"

      await expect(
        processAlchemyWebhook(rawBody, invalidSignature, TEST_SIGNING_KEYS, TEST_CHAIN_ID),
      ).rejects.toThrow("Invalid signature")
    })

    it("throws 'Invalid signature' when signature is for different body", async () => {
      const payload = buildAlchemyPayload()
      const rawBody = JSON.stringify(payload)
      // Generate valid signature for a different body
      const signature = generateSignature("different-body-content", TEST_SIGNING_KEY)

      await expect(
        processAlchemyWebhook(rawBody, signature, TEST_SIGNING_KEYS, TEST_CHAIN_ID),
      ).rejects.toThrow("Invalid signature")
    })

    it("accepts valid signature", async () => {
      const contractAddress = "0x1111111111111111111111111111111111111111" as `0x${string}`
      const payload = buildAlchemyPayloadFromEvent({
        abi: dualTokenVaultAbi,
        eventName: "BondIssued",
        args: {
          creator: "0x2222222222222222222222222222222222222222",
          vaultToken: "0x3333333333333333333333333333333333333333",
          stableToken: "0x4444444444444444444444444444444444444444",
          vaultTokenAmount: 1000000000000000000n,
          stableTokenAmount: 5000000000000000000n,
          managementFeeAmount: 50000000000000000n,
        },
        contractAddress,
      })
      const rawBody = JSON.stringify(payload)
      const signature = generateSignature(rawBody, TEST_SIGNING_KEY)

      const result = await processAlchemyWebhook(
        rawBody,
        signature,
        TEST_SIGNING_KEYS,
        TEST_CHAIN_ID,
      )

      expect(result.success).toBe(true)
    })

    it("validates against multiple keys and identifies the matching one", async () => {
      const multipleKeys = {
        "webhook-a": "key-for-webhook-a",
        "webhook-b": "key-for-webhook-b",
        "webhook-c": TEST_SIGNING_KEY, // This one will match
      }

      const contractAddress = "0x1111111111111111111111111111111111111111" as `0x${string}`
      const payload = buildAlchemyPayloadFromEvent({
        abi: dualTokenVaultAbi,
        eventName: "BondIssued",
        args: {
          creator: "0x2222222222222222222222222222222222222222",
          vaultToken: "0x3333333333333333333333333333333333333333",
          stableToken: "0x4444444444444444444444444444444444444444",
          vaultTokenAmount: 1000000000000000000n,
          stableTokenAmount: 5000000000000000000n,
          managementFeeAmount: 50000000000000000n,
        },
        contractAddress,
      })
      const rawBody = JSON.stringify(payload)
      const signature = generateSignature(rawBody, TEST_SIGNING_KEY)

      const result = await processAlchemyWebhook(rawBody, signature, multipleKeys, TEST_CHAIN_ID)

      expect(result.success).toBe(true)
      expect(result.webhookSource).toBe("webhook-c")
    })
  })

  describe("return values", () => {
    it("returns success: true, logsProcessed count, and webhookSource for single log", async () => {
      const contractAddress = "0x1111111111111111111111111111111111111111" as `0x${string}`
      const payload = buildAlchemyPayloadFromEvent({
        abi: dualTokenVaultAbi,
        eventName: "BondIssued",
        args: {
          creator: "0x2222222222222222222222222222222222222222",
          vaultToken: "0x3333333333333333333333333333333333333333",
          stableToken: "0x4444444444444444444444444444444444444444",
          vaultTokenAmount: 1000000000000000000n,
          stableTokenAmount: 5000000000000000000n,
          managementFeeAmount: 50000000000000000n,
        },
        contractAddress,
      })
      const rawBody = JSON.stringify(payload)
      const signature = generateSignature(rawBody, TEST_SIGNING_KEY)

      const result = await processAlchemyWebhook(
        rawBody,
        signature,
        TEST_SIGNING_KEYS,
        TEST_CHAIN_ID,
      )

      expect(result).toEqual({ success: true, logsProcessed: 1, webhookSource: "test" })
    })

    it("returns correct logsProcessed count for multiple logs", async () => {
      const { buildAlchemyLogFromEvent } = await import("../../test/helpers/alchemy-builders")

      const log1 = buildAlchemyLogFromEvent({
        abi: dualTokenVaultAbi,
        eventName: "BondIssued",
        args: {
          creator: "0x1111111111111111111111111111111111111111",
          vaultToken: "0x2222222222222222222222222222222222222222",
          stableToken: "0x3333333333333333333333333333333333333333",
          vaultTokenAmount: 1000000n,
          stableTokenAmount: 2000000n,
          managementFeeAmount: 10000n,
        },
        overrides: { index: 0 },
      })

      const log2 = buildAlchemyLogFromEvent({
        abi: dualTokenVaultAbi,
        eventName: "TradeCompleted",
        args: {
          vaultAddress: "0x4444444444444444444444444444444444444444",
          routerAddress: "0x5555555555555555555555555555555555555555",
          tokenIn: "0x6666666666666666666666666666666666666666",
          tokenOut: "0x7777777777777777777777777777777777777777",
          amountIn: 1000000n,
          amountOut: 2000000n,
          tokenInBalanceAfterSwap: 5000000n,
          tokenOutBalanceAfterSwap: 3000000n,
        },
        overrides: { index: 1 },
      })

      const payload = buildAlchemyPayload({ logs: [log1, log2] })
      const rawBody = JSON.stringify(payload)
      const signature = generateSignature(rawBody, TEST_SIGNING_KEY)

      const result = await processAlchemyWebhook(
        rawBody,
        signature,
        TEST_SIGNING_KEYS,
        TEST_CHAIN_ID,
      )

      expect(result).toEqual({ success: true, logsProcessed: 2, webhookSource: "test" })
    })

    it("returns logsProcessed: 0 for empty logs array", async () => {
      const payload = buildAlchemyPayload({ logs: [] })
      const rawBody = JSON.stringify(payload)
      const signature = generateSignature(rawBody, TEST_SIGNING_KEY)

      const result = await processAlchemyWebhook(
        rawBody,
        signature,
        TEST_SIGNING_KEYS,
        TEST_CHAIN_ID,
      )

      expect(result).toEqual({ success: true, logsProcessed: 0, webhookSource: "test" })
    })
  })

  describe("end-to-end processing", () => {
    it("stores event in database with correct chainId", async () => {
      const contractAddress = "0xABCDEF1234567890ABCDEF1234567890ABCDEF12" as `0x${string}`
      const payload = buildAlchemyPayloadFromEvent({
        abi: dualTokenVaultAbi,
        eventName: "BondIssued",
        args: {
          creator: "0x1111111111111111111111111111111111111111",
          vaultToken: "0x2222222222222222222222222222222222222222",
          stableToken: "0x3333333333333333333333333333333333333333",
          vaultTokenAmount: 1000000000000000000n,
          stableTokenAmount: 5000000000000000000n,
          managementFeeAmount: 50000000000000000n,
        },
        contractAddress,
      })
      const rawBody = JSON.stringify(payload)
      const signature = generateSignature(rawBody, TEST_SIGNING_KEY)

      await processAlchemyWebhook(rawBody, signature, TEST_SIGNING_KEYS, TEST_CHAIN_ID)

      // Verify event was stored with correct chainId
      const stored = await db.select().from(intakeEvents)

      expect(stored).toHaveLength(1)
      expect(stored[0]?.chainId).toBe(TEST_CHAIN_ID)
      expect(stored[0]?.eventName).toBe("BondIssued")
      expect(stored[0]?.status).toBe("success")
    })

    it("calls handler with decoded event args", async () => {
      const contractAddress = "0xABCDEF1234567890ABCDEF1234567890ABCDEF12" as `0x${string}`
      const payload = buildAlchemyPayloadFromEvent({
        abi: dualTokenVaultAbi,
        eventName: "BondIssued",
        args: {
          creator: "0x1111111111111111111111111111111111111111",
          vaultToken: "0x2222222222222222222222222222222222222222",
          stableToken: "0x3333333333333333333333333333333333333333",
          vaultTokenAmount: 1000000000000000000n,
          stableTokenAmount: 5000000000000000000n,
          managementFeeAmount: 50000000000000000n,
        },
        contractAddress,
      })
      const rawBody = JSON.stringify(payload)
      const signature = generateSignature(rawBody, TEST_SIGNING_KEY)

      await processAlchemyWebhook(rawBody, signature, TEST_SIGNING_KEYS, TEST_CHAIN_ID)

      expect(mockHandler).toHaveBeenCalledOnce()
      expect(mockHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: "BondIssued",
          args: expect.objectContaining({
            creator: "0x1111111111111111111111111111111111111111",
            vaultTokenAmount: 1000000000000000000n,
          }),
        }),
      )
    })

    it("stores unrecognized events with failed status and error message", async () => {
      // Use a random log that doesn't match any known event
      const unknownLog = buildAlchemyLog({
        // Random topics that won't match any ABI
        topics: [
          "0xdeadbeef00000000000000000000000000000000000000000000000000000000",
          "0x0000000000000000000000001111111111111111111111111111111111111111",
        ],
        data: "0x",
      })

      const payload = buildAlchemyPayload({ logs: [unknownLog] })
      const rawBody = JSON.stringify(payload)
      const signature = generateSignature(rawBody, TEST_SIGNING_KEY)

      const result = await processAlchemyWebhook(
        rawBody,
        signature,
        TEST_SIGNING_KEYS,
        TEST_CHAIN_ID,
      )

      // Still returns success from the webhook's perspective - log was stored
      expect(result).toEqual({ success: true, logsProcessed: 1, webhookSource: "test" })

      // Verify event was stored with null eventName and failed status
      const stored = await db.select().from(intakeEvents)
      expect(stored).toHaveLength(1)
      expect(stored[0]?.eventName).toBeNull()
      expect(stored[0]?.status).toBe("failed")
      expect(stored[0]?.error).toBe("Unknown event signature")
    })
  })
})

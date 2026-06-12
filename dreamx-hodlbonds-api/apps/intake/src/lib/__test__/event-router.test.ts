/**
 * Tests for event router
 * Verifies log storage, decoding, status tracking, and error handling
 * Uses real database with cleanup between tests
 */

import { getDb } from "@hodlbonds-api/db"
import { intakeEvents } from "@hodlbonds-api/db/schema/index"
import { eq } from "drizzle-orm"
import { erc1155Abi, getAddress } from "viem"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { encodeEvent } from "@/test/helpers/event-encoding"
import { buildBondIssuedLog, buildLog, buildVaultCreatedLog } from "@/test/helpers/log-builders"

import * as eventHandlers from "../event-handlers"
import { routeEvents } from "../event-router"

const db = getDb()

describe("routeEvents", () => {
  let mockHandler: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    // Clean database before each test
    await db.delete(intakeEvents)

    // Mock handler to avoid calling real handlers
    mockHandler = vi.fn().mockResolvedValue(null)
    vi.spyOn(eventHandlers, "getEventHandler").mockReturnValue(
      mockHandler as ReturnType<typeof eventHandlers.getEventHandler>,
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("basic log processing", () => {
    it("inserts raw log immediately and processes it", async () => {
      const log = buildBondIssuedLog(
        {
          creator: "0x1111111111111111111111111111111111111111",
          vaultToken: "0x2222222222222222222222222222222222222222",
          stableToken: "0x3333333333333333333333333333333333333333",
          vaultTokenAmount: 1000000n,
          stableTokenAmount: 5000000n,
          managementFeeAmount: 50000n,
        },
        { chainId: 1, logIndex: 0 },
      )

      await routeEvents([log])

      // Verify log was inserted and processed
      const stored = await db
        .select()
        .from(intakeEvents)
        .where(eq(intakeEvents.txHash, log.transactionHash))

      expect(stored).toHaveLength(1)
      expect(stored[0]?.status).toBe("success")
      expect(stored[0]?.eventName).toBe("BondIssued")
      expect(stored[0]?.chainId).toBe(1)
      expect(stored[0]?.logIndex).toBe(0)
      expect(stored[0]?.processedAt).toBeInstanceOf(Date)
      // Verify rawLog is stored
      expect(stored[0]?.rawLog).toMatchObject({
        transactionHash: log.transactionHash,
        chainId: 1,
        logIndex: 0,
      })

      // Verify handler was called with decoded event
      expect(mockHandler).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          eventName: "BondIssued",
          transactionHash: log.transactionHash,
        }),
      )
    })

    it("stores decoded args with BigInt values preserved", async () => {
      const log = buildBondIssuedLog(
        {
          creator: "0x1111111111111111111111111111111111111111",
          vaultToken: "0x2222222222222222222222222222222222222222",
          stableToken: "0x3333333333333333333333333333333333333333",
          vaultTokenAmount: 1000000n,
          stableTokenAmount: 5000000n,
          managementFeeAmount: 50000n,
        },
        { chainId: 1, logIndex: 0 },
      )

      await routeEvents([log])

      const stored = await db
        .select()
        .from(intakeEvents)
        .where(eq(intakeEvents.txHash, log.transactionHash))

      // Verify args are stored and BigInt values are preserved via custom type
      expect(stored[0]?.args).toMatchObject({
        creator: "0x1111111111111111111111111111111111111111",
        vaultToken: "0x2222222222222222222222222222222222222222",
        stableToken: "0x3333333333333333333333333333333333333333",
        vaultTokenAmount: 1000000n,
        stableTokenAmount: 5000000n,
        managementFeeAmount: 50000n,
      })
    })

    it("stores nested BigInt values in VaultCreated args", async () => {
      const log = buildVaultCreatedLog(
        {
          creator: "0x1111111111111111111111111111111111111111",
          vaultId: 42n,
          vaultAddress: "0x2222222222222222222222222222222222222222",
          pairId: 1n,
          approvedPair: {
            stableTokenAddress: "0x3333333333333333333333333333333333333333",
            vaultTokenAddress: "0x4444444444444444444444444444444444444444",
            wrappedNativeTokenAddress: "0x5555555555555555555555555555555555555555",
            routerAddress: "0x6666666666666666666666666666666666666666",
            tokenPairAddress: "0x7777777777777777777777777777777777777777",
            version: 2,
            routerV2Address: "0x8888888888888888888888888888888888888888",
            pairAddress: "0x9999999999999999999999999999999999999999",
            concentrated: false,
            chainlinkPriceOracleAddress: "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa",
          },
          vaultParameters: {
            stableTokenAddress: "0x3333333333333333333333333333333333333333",
            vaultTokenAddress: "0x4444444444444444444444444444444444444444",
            receiptTokenAddress: getAddress("0xBbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBb"),
            chainlinkPriceOracleAddress: "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa",
            feeSplitterAddress: getAddress("0xCcCcCCCCcCcCcCCcCcCcCcCCcCcCccccCcCccCcc"),
            vaultId: 42n,
            minUSDPricePerBond: 500000000000000000n,
            managementFee: 200,
            performanceFee: 500,
            bondPrice: 1000000000000000000n,
            reserveRatio: 5000,
            tradingPeriodDuration: 86400,

            primaryDex: 1,
          },
        },
        { chainId: 137, logIndex: 5, blockNumber: 12345n },
      )

      await routeEvents([log])

      const stored = await db
        .select()
        .from(intakeEvents)
        .where(eq(intakeEvents.txHash, log.transactionHash))

      // Verify nested BigInt values are preserved
      expect(stored[0]?.args).toMatchObject({
        vaultId: 42n,
        vaultParameters: expect.objectContaining({
          bondPrice: 1000000000000000000n,
          minUSDPricePerBond: 500000000000000000n,
        }),
      })
    })

    it("handles empty log array gracefully", async () => {
      await routeEvents([])

      const stored = await db.select().from(intakeEvents)
      expect(stored).toHaveLength(0)
      expect(mockHandler).not.toHaveBeenCalled()
    })

    it("handles log with missing blockTimestamp", async () => {
      const log = buildBondIssuedLog(
        {
          creator: "0x1111111111111111111111111111111111111111",
          vaultToken: "0x2222222222222222222222222222222222222222",
          stableToken: "0x3333333333333333333333333333333333333333",
          vaultTokenAmount: 1000000n,
          stableTokenAmount: 5000000n,
          managementFeeAmount: 50000n,
        },
        { chainId: 1, logIndex: 0, blockTimestamp: undefined },
      )

      await routeEvents([log])

      const stored = await db
        .select()
        .from(intakeEvents)
        .where(eq(intakeEvents.txHash, log.transactionHash))

      expect(stored[0]?.blockTimestamp).toBeNull()
      expect(stored[0]?.status).toBe("success")
    })
  })

  describe("decode failures", () => {
    it("marks log as failed when decode fails (unknown signature)", async () => {
      // Build a log with random topics that won't match any known event
      const unknownLog = buildLog({ chainId: 1, logIndex: 0 })

      await routeEvents([unknownLog])

      const stored = await db
        .select()
        .from(intakeEvents)
        .where(eq(intakeEvents.txHash, unknownLog.transactionHash))

      expect(stored).toHaveLength(1)
      expect(stored[0]?.status).toBe("failed")
      expect(stored[0]?.error).toContain("Unknown event signature")
      // eventName and args should be null for decode failures
      expect(stored[0]?.eventName).toBeNull()
      expect(stored[0]?.args).toBeNull()
      // But rawLog should still be stored
      expect(stored[0]?.rawLog).toMatchObject({
        transactionHash: unknownLog.transactionHash,
      })

      expect(mockHandler).not.toHaveBeenCalled()
    })
  })

  describe("handler failures", () => {
    it("marks log as failed with decoded data when handler fails", async () => {
      const log = buildBondIssuedLog(
        {
          creator: "0x1111111111111111111111111111111111111111",
          vaultToken: "0x2222222222222222222222222222222222222222",
          stableToken: "0x3333333333333333333333333333333333333333",
          vaultTokenAmount: 1000000n,
          stableTokenAmount: 5000000n,
          managementFeeAmount: 50000n,
        },
        { chainId: 1, logIndex: 0 },
      )

      mockHandler.mockRejectedValueOnce(new Error("Database connection failed"))
      await routeEvents([log])

      const stored = await db
        .select()
        .from(intakeEvents)
        .where(eq(intakeEvents.txHash, log.transactionHash))

      expect(stored[0]?.status).toBe("failed")
      expect(stored[0]?.error).toBe("Database connection failed")
      // Decode succeeded, so eventName and args should be populated
      expect(stored[0]?.eventName).toBe("BondIssued")
      expect(stored[0]?.args).toMatchObject({
        vaultTokenAmount: 1000000n,
      })
      expect(stored[0]?.processedAt).toBeInstanceOf(Date)
    })

    it("handles non-Error exceptions", async () => {
      const log = buildBondIssuedLog(
        {
          creator: "0x1111111111111111111111111111111111111111",
          vaultToken: "0x2222222222222222222222222222222222222222",
          stableToken: "0x3333333333333333333333333333333333333333",
          vaultTokenAmount: 1000000n,
          stableTokenAmount: 5000000n,
          managementFeeAmount: 50000n,
        },
        { chainId: 1, logIndex: 0 },
      )

      mockHandler.mockRejectedValueOnce("String error")
      await routeEvents([log])

      const stored = await db
        .select()
        .from(intakeEvents)
        .where(eq(intakeEvents.txHash, log.transactionHash))

      expect(stored[0]?.status).toBe("failed")
      expect(stored[0]?.error).toBe("String error")
    })
  })

  describe("unsupported events", () => {
    beforeEach(() => {
      // Restore the real isSupportedEvent function for these tests
      vi.restoreAllMocks()
    })

    it("deletes events that decode successfully but have no handler", async () => {
      // Create an ApprovalForAll event from ERC1155 - it's in the ABI but we don't have a handler for it
      const { topics, data } = encodeEvent({
        abi: erc1155Abi,
        eventName: "ApprovalForAll",
        args: {
          account: "0x1111111111111111111111111111111111111111",
          operator: "0x2222222222222222222222222222222222222222",
          approved: true,
        },
      })

      const unsupportedLog = buildLog({
        chainId: 1,
        logIndex: 0,
        address: "0x1234567890123456789012345678901234567890",
        topics,
        data,
      })

      await routeEvents([unsupportedLog])

      // Event should be deleted from database
      const stored = await db
        .select()
        .from(intakeEvents)
        .where(eq(intakeEvents.txHash, unsupportedLog.transactionHash))

      expect(stored).toHaveLength(0)
    })

    it("processes supported and unsupported events in the same batch", async () => {
      const supportedLog = buildBondIssuedLog(
        {
          creator: "0x1111111111111111111111111111111111111111",
          vaultToken: "0x2222222222222222222222222222222222222222",
          stableToken: "0x3333333333333333333333333333333333333333",
          vaultTokenAmount: 1000000n,
          stableTokenAmount: 5000000n,
          managementFeeAmount: 50000n,
        },
        { chainId: 1, logIndex: 0 },
      )

      const { topics: unsupportedTopics, data: unsupportedData } = encodeEvent({
        abi: erc1155Abi,
        eventName: "ApprovalForAll",
        args: {
          account: "0x1111111111111111111111111111111111111111",
          operator: "0x2222222222222222222222222222222222222222",
          approved: false,
        },
      })

      const unsupportedLog = buildLog({
        chainId: 1,
        logIndex: 1,
        transactionHash: "0xabcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab",
        address: "0x1234567890123456789012345678901234567890",
        topics: unsupportedTopics,
        data: unsupportedData,
      })

      await routeEvents([supportedLog, unsupportedLog])

      // Only the supported event should remain
      const allStored = await db.select().from(intakeEvents)
      expect(allStored).toHaveLength(1)
      expect(allStored[0]?.eventName).toBe("BondIssued")
      expect(allStored[0]?.status).toBe("success")

      // Verify unsupported event is not in database
      const unsupportedStored = await db
        .select()
        .from(intakeEvents)
        .where(eq(intakeEvents.txHash, unsupportedLog.transactionHash))
      expect(unsupportedStored).toHaveLength(0)
    })

    it("does not count deleted events as success or failure", async () => {
      const { topics, data } = encodeEvent({
        abi: erc1155Abi,
        eventName: "ApprovalForAll",
        args: {
          account: "0x1111111111111111111111111111111111111111",
          operator: "0x2222222222222222222222222222222222222222",
          approved: true,
        },
      })

      const unsupportedLog = buildLog({
        chainId: 1,
        logIndex: 0,
        address: "0x1234567890123456789012345678901234567890",
        topics,
        data,
      })

      // Spy on console.log to verify the summary message
      const consoleLogSpy = vi.spyOn(console, "log")

      await routeEvents([unsupportedLog])

      // Should log about deleted events
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("1 unsupported events discarded"),
      )

      consoleLogSpy.mockRestore()
    })
  })

  describe("deduplication", () => {
    it("skips logs that already succeeded", async () => {
      const log = buildBondIssuedLog(
        {
          creator: "0x1111111111111111111111111111111111111111",
          vaultToken: "0x2222222222222222222222222222222222222222",
          stableToken: "0x3333333333333333333333333333333333333333",
          vaultTokenAmount: 1000000n,
          stableTokenAmount: 5000000n,
          managementFeeAmount: 50000n,
        },
        { chainId: 1, logIndex: 0 },
      )

      // First processing
      await routeEvents([log])
      expect(mockHandler).toHaveBeenCalledOnce()

      // Second processing - should skip
      mockHandler.mockClear()
      await routeEvents([log])
      expect(mockHandler).not.toHaveBeenCalled()

      // Verify still only one log in DB
      const stored = await db
        .select()
        .from(intakeEvents)
        .where(eq(intakeEvents.txHash, log.transactionHash))

      expect(stored).toHaveLength(1)
      expect(stored[0]?.status).toBe("success")
    })

    it("returns early when all logs already successfully processed", async () => {
      const log1 = buildBondIssuedLog(
        {
          creator: "0x1111111111111111111111111111111111111111",
          vaultToken: "0x2222222222222222222222222222222222222222",
          stableToken: "0x3333333333333333333333333333333333333333",
          vaultTokenAmount: 1000000n,
          stableTokenAmount: 5000000n,
          managementFeeAmount: 50000n,
        },
        { chainId: 1, logIndex: 0 },
      )

      const log2 = buildBondIssuedLog(
        {
          creator: "0x4444444444444444444444444444444444444444",
          vaultToken: "0x5555555555555555555555555555555555555555",
          stableToken: "0x6666666666666666666666666666666666666666",
          vaultTokenAmount: 2000000n,
          stableTokenAmount: 10000000n,
          managementFeeAmount: 100000n,
        },
        { chainId: 1, logIndex: 1 },
      )

      // Process both logs successfully
      await routeEvents([log1, log2])
      expect(mockHandler).toHaveBeenCalledTimes(2)

      // Try processing same logs again - should return early
      mockHandler.mockClear()
      await routeEvents([log1, log2])
      expect(mockHandler).not.toHaveBeenCalled()

      // Verify both logs still in DB with success status
      const stored = await db.select().from(intakeEvents).orderBy(intakeEvents.logIndex)
      expect(stored).toHaveLength(2)
      expect(stored.every((e) => e.status === "success")).toBe(true)
    })

    it("retries failed logs", async () => {
      const log = buildBondIssuedLog(
        {
          creator: "0x1111111111111111111111111111111111111111",
          vaultToken: "0x2222222222222222222222222222222222222222",
          stableToken: "0x3333333333333333333333333333333333333333",
          vaultTokenAmount: 1000000n,
          stableTokenAmount: 5000000n,
          managementFeeAmount: 50000n,
        },
        { chainId: 1, logIndex: 0 },
      )

      // First processing - fail
      mockHandler.mockRejectedValueOnce(new Error("Handler failed"))
      await routeEvents([log])

      const failed = await db
        .select()
        .from(intakeEvents)
        .where(eq(intakeEvents.txHash, log.transactionHash))

      expect(failed[0]?.status).toBe("failed")
      expect(failed[0]?.error).toBe("Handler failed")

      // Second processing - should retry and succeed
      mockHandler.mockResolvedValueOnce(null)
      await routeEvents([log])

      const retried = await db
        .select()
        .from(intakeEvents)
        .where(eq(intakeEvents.txHash, log.transactionHash))

      expect(retried[0]?.status).toBe("success")
      expect(retried[0]?.error).toBeNull()
      expect(mockHandler).toHaveBeenCalledTimes(2)
    })

    it("updates rawLog and blockTimestamp when retrying failed logs", async () => {
      const originalLog = buildBondIssuedLog(
        {
          creator: "0x1111111111111111111111111111111111111111",
          vaultToken: "0x2222222222222222222222222222222222222222",
          stableToken: "0x3333333333333333333333333333333333333333",
          vaultTokenAmount: 1000000n,
          stableTokenAmount: 5000000n,
          managementFeeAmount: 50000n,
        },
        { chainId: 1, logIndex: 0, blockTimestamp: 1000000n },
      )

      // First processing - fail
      mockHandler.mockRejectedValueOnce(new Error("Handler failed"))
      await routeEvents([originalLog])

      const failed = await db
        .select()
        .from(intakeEvents)
        .where(eq(intakeEvents.txHash, originalLog.transactionHash))

      expect(failed[0]?.status).toBe("failed")
      expect(failed[0]?.blockTimestamp).toEqual(new Date(1000000 * 1000))

      // Second processing with updated timestamp - should update rawLog and blockTimestamp
      const updatedLog = {
        ...originalLog,
        blockTimestamp: 2000000n, // New timestamp
      }

      mockHandler.mockResolvedValueOnce(null)
      await routeEvents([updatedLog])

      const retried = await db
        .select()
        .from(intakeEvents)
        .where(eq(intakeEvents.txHash, originalLog.transactionHash))

      expect(retried[0]?.status).toBe("success")
      expect(retried[0]?.error).toBeNull()
      // Verify blockTimestamp was updated
      expect(retried[0]?.blockTimestamp).toEqual(new Date(2000000 * 1000))
      // Verify rawLog was updated (bigint serialized as string)
      expect((retried[0]?.rawLog as any)?.blockTimestamp).toBe(2000000n)
      expect(mockHandler).toHaveBeenCalledTimes(2)
    })

    it("processes new logs in a batch with duplicates", async () => {
      const log1 = buildBondIssuedLog(
        {
          creator: "0x1111111111111111111111111111111111111111",
          vaultToken: "0x2222222222222222222222222222222222222222",
          stableToken: "0x3333333333333333333333333333333333333333",
          vaultTokenAmount: 1000000n,
          stableTokenAmount: 5000000n,
          managementFeeAmount: 50000n,
        },
        { chainId: 1, logIndex: 0 },
      )

      const log2 = buildBondIssuedLog(
        {
          creator: "0x1111111111111111111111111111111111111111",
          vaultToken: "0x2222222222222222222222222222222222222222",
          stableToken: "0x3333333333333333333333333333333333333333",
          vaultTokenAmount: 2000000n,
          stableTokenAmount: 10000000n,
          managementFeeAmount: 100000n,
        },
        { chainId: 1, logIndex: 1 },
      )

      // Process first log
      await routeEvents([log1])
      expect(mockHandler).toHaveBeenCalledOnce()

      // Process batch with duplicate and new log
      mockHandler.mockClear()
      await routeEvents([log1, log2])

      // Should only process log2
      expect(mockHandler).toHaveBeenCalledOnce()

      const stored = await db.select().from(intakeEvents)
      expect(stored).toHaveLength(2)
      expect(stored.every((e) => e.status === "success")).toBe(true)
    })
  })

  describe("error handling", () => {
    it("continues processing other logs when one fails", async () => {
      const log1 = buildBondIssuedLog(
        {
          creator: "0x1111111111111111111111111111111111111111",
          vaultToken: "0x2222222222222222222222222222222222222222",
          stableToken: "0x3333333333333333333333333333333333333333",
          vaultTokenAmount: 1000000n,
          stableTokenAmount: 5000000n,
          managementFeeAmount: 50000n,
        },
        { chainId: 1, logIndex: 0 },
      )

      const log2 = buildBondIssuedLog(
        {
          creator: "0x4444444444444444444444444444444444444444",
          vaultToken: "0x5555555555555555555555555555555555555555",
          stableToken: "0x6666666666666666666666666666666666666666",
          vaultTokenAmount: 2000000n,
          stableTokenAmount: 10000000n,
          managementFeeAmount: 100000n,
        },
        { chainId: 1, logIndex: 1 },
      )

      // First log fails, second succeeds
      mockHandler.mockRejectedValueOnce(new Error("First log failed")).mockResolvedValueOnce(null)

      await routeEvents([log1, log2])

      const stored = await db.select().from(intakeEvents).orderBy(intakeEvents.logIndex)

      expect(stored).toHaveLength(2)
      expect(stored[0]?.status).toBe("failed")
      expect(stored[0]?.error).toBe("First log failed")
      expect(stored[1]?.status).toBe("success")
      expect(stored[1]?.error).toBeNull()

      expect(mockHandler).toHaveBeenCalledTimes(2)
    })
  })

  describe("batch processing", () => {
    it("processes multiple logs in parallel", async () => {
      const logs = Array.from({ length: 5 }, (_, i) =>
        buildBondIssuedLog(
          {
            creator: "0x1111111111111111111111111111111111111111",
            vaultToken: "0x2222222222222222222222222222222222222222",
            stableToken: "0x3333333333333333333333333333333333333333",
            vaultTokenAmount: BigInt(1000000 + i),
            stableTokenAmount: BigInt(5000000 + i),
            managementFeeAmount: BigInt(50000 + i),
          },
          { chainId: 1, logIndex: i },
        ),
      )

      await routeEvents(logs)

      const stored = await db.select().from(intakeEvents).orderBy(intakeEvents.logIndex)

      expect(stored).toHaveLength(5)
      expect(stored.every((e) => e.status === "success")).toBe(true)
      expect(mockHandler).toHaveBeenCalledTimes(5)
    })

    it("handles mix of new, duplicate, and failed logs", async () => {
      const newLog = buildBondIssuedLog(
        {
          creator: "0x1111111111111111111111111111111111111111",
          vaultToken: "0x2222222222222222222222222222222222222222",
          stableToken: "0x3333333333333333333333333333333333333333",
          vaultTokenAmount: 1000000n,
          stableTokenAmount: 5000000n,
          managementFeeAmount: 50000n,
        },
        { chainId: 1, logIndex: 0 },
      )

      const duplicateLog = buildBondIssuedLog(
        {
          creator: "0x4444444444444444444444444444444444444444",
          vaultToken: "0x5555555555555555555555555555555555555555",
          stableToken: "0x6666666666666666666666666666666666666666",
          vaultTokenAmount: 2000000n,
          stableTokenAmount: 10000000n,
          managementFeeAmount: 100000n,
        },
        { chainId: 1, logIndex: 1 },
      )

      const failedLog = buildBondIssuedLog(
        {
          creator: "0x7777777777777777777777777777777777777777",
          vaultToken: "0x8888888888888888888888888888888888888888",
          stableToken: "0x9999999999999999999999999999999999999999",
          vaultTokenAmount: 3000000n,
          stableTokenAmount: 15000000n,
          managementFeeAmount: 150000n,
        },
        { chainId: 1, logIndex: 2 },
      )

      // Pre-populate: one successful, one failed
      await routeEvents([duplicateLog])
      mockHandler.mockRejectedValueOnce(new Error("Initial failure"))
      await routeEvents([failedLog])
      mockHandler.mockClear()

      // Process batch: new + duplicate + retry failed
      mockHandler.mockResolvedValue(null)
      await routeEvents([newLog, duplicateLog, failedLog])

      // Should process newLog (1) and failedLog (1), skip duplicateLog
      expect(mockHandler).toHaveBeenCalledTimes(2)

      const stored = await db.select().from(intakeEvents).orderBy(intakeEvents.logIndex)

      expect(stored).toHaveLength(3)
      expect(stored.every((e) => e.status === "success")).toBe(true)
    })
  })

  describe("timestamps", () => {
    it("sets receivedAt on insert and processedAt after delay when retry succeeds", async () => {
      // Use fake timers
      vi.useFakeTimers()
      const firstProcessTime = new Date("2025-01-15T10:00:00.000Z")
      vi.setSystemTime(firstProcessTime)

      const log = buildBondIssuedLog(
        {
          creator: "0x1111111111111111111111111111111111111111",
          vaultToken: "0x2222222222222222222222222222222222222222",
          stableToken: "0x3333333333333333333333333333333333333333",
          vaultTokenAmount: 1000000n,
          stableTokenAmount: 5000000n,
          managementFeeAmount: 50000n,
        },
        { chainId: 1, logIndex: 0 },
      )

      // First attempt: fail the handler
      mockHandler.mockRejectedValueOnce(new Error("Temporary failure"))
      await routeEvents([log])

      // Check timestamps after first (failed) attempt
      const afterFirstAttempt = await db
        .select()
        .from(intakeEvents)
        .where(eq(intakeEvents.txHash, log.transactionHash))

      expect(afterFirstAttempt).toHaveLength(1)
      expect(afterFirstAttempt[0]?.status).toBe("failed")
      // receivedAt is set by DB default (can't control with fake timers)
      const originalReceivedAt = afterFirstAttempt[0]?.receivedAt
      expect(originalReceivedAt).toBeInstanceOf(Date)
      // processedAt should be set to our fake time
      expect(afterFirstAttempt[0]?.processedAt).toEqual(firstProcessTime)

      // Advance time by 5 minutes
      const retryTime = new Date("2025-01-15T10:05:00.000Z")
      vi.setSystemTime(retryTime)

      // Second attempt: succeed
      mockHandler.mockResolvedValueOnce(null)
      await routeEvents([log])

      // Check timestamps after retry succeeds
      const afterRetry = await db
        .select()
        .from(intakeEvents)
        .where(eq(intakeEvents.txHash, log.transactionHash))

      expect(afterRetry).toHaveLength(1)
      expect(afterRetry[0]?.status).toBe("success")
      // receivedAt should NOT change (still original value from first insert)
      expect(afterRetry[0]?.receivedAt).toEqual(originalReceivedAt)
      // processedAt should be updated to retry time (5 minutes later)
      expect(afterRetry[0]?.processedAt).toEqual(retryTime)
      // Verify there's actually a 5-minute difference
      expect(afterRetry[0]!.processedAt!.getTime() - firstProcessTime.getTime()).toBe(5 * 60 * 1000)

      // Restore real timers
      vi.useRealTimers()
    })
  })
})

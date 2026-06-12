/**
 * Tests for TransferBatch event handler
 * Verifies batch transfer processing reuses TransferSingle logic correctly
 */

import { faker } from "@faker-js/faker"
import { getDb } from "@hodlbonds-api/db"
import { receiptTokenBalances, receiptTokenTransfers, schema } from "@hodlbonds-api/db/schema/index"
import { and, eq } from "drizzle-orm"
import { reset } from "drizzle-seed"
import { getAddress, zeroAddress } from "viem"
import { beforeEach, describe, expect, it } from "vitest"

import { buildTransferBatchEvent } from "@/test/helpers/event-builders"

import { handleTransferBatch } from "../transfer-batch"
import { ESCROW_ADDRESSES, MissingBalanceError } from "../transfer-single"

const db = getDb()

// Test chain ID - has escrow addresses configured
const TEST_CHAIN_ID = 1337

// Get escrow addresses for test chain
const MARKETPLACE_ADDRESS = getAddress(
  Object.keys(ESCROW_ADDRESSES[TEST_CHAIN_ID]!).find(
    (addr) => ESCROW_ADDRESSES[TEST_CHAIN_ID]![addr] === "marketplace",
  )!,
)

// Helper to generate addresses
const randomAddress = () => getAddress(faker.finance.ethereumAddress())

// Helper to insert a balance entry for testing
async function insertTestBalance(params: {
  chainId: number
  receiptTokenAddress: `0x${string}`
  tokenId: number
  ownerAddress: `0x${string}`
  balance: bigint
  lastUpdateBlockNumber: number
  lastUpdateBlockTimestamp: Date
}) {
  await db.insert(receiptTokenBalances).values(params)
}

// Helper to get a balance entry
async function getBalance(
  chainId: number,
  receiptTokenAddress: string,
  tokenId: number,
  ownerAddress: string,
) {
  const [balance] = await db
    .select()
    .from(receiptTokenBalances)
    .where(
      and(
        eq(receiptTokenBalances.chainId, chainId),
        eq(receiptTokenBalances.receiptTokenAddress, receiptTokenAddress),
        eq(receiptTokenBalances.tokenId, tokenId),
        eq(receiptTokenBalances.ownerAddress, ownerAddress),
      ),
    )
    .limit(1)
  return balance
}

// Helper to get all transfers for a contract
async function getTransfers(chainId: number, receiptTokenAddress: string) {
  return await db
    .select()
    .from(receiptTokenTransfers)
    .where(
      and(
        eq(receiptTokenTransfers.chainId, chainId),
        eq(receiptTokenTransfers.receiptTokenAddress, receiptTokenAddress),
      ),
    )
}

describe("handleTransferBatch", () => {
  beforeEach(async () => {
    await reset(db, schema)
  })

  describe("basic batch processing", () => {
    it("processes multiple transfers in a single batch", async () => {
      const receiptTokenAddress = randomAddress()
      const to = randomAddress()

      const event = buildTransferBatchEvent(
        {
          operator: to,
          from: zeroAddress,
          to,
          ids: [1n, 2n, 3n],
          values: [100n, 200n, 300n],
        },
        {
          chainId: TEST_CHAIN_ID,
          address: receiptTokenAddress,
          blockNumber: 1000n,
          blockTimestamp: BigInt(Math.floor(Date.now() / 1000)),
        },
      )

      await handleTransferBatch(event)

      // Should have 3 transfer records
      const transfers = await getTransfers(TEST_CHAIN_ID, receiptTokenAddress)
      expect(transfers).toHaveLength(3)

      // All should be mints
      expect(transfers.every((t) => t.type === "mint")).toBe(true)

      // Check balances
      const balance1 = await getBalance(TEST_CHAIN_ID, receiptTokenAddress, 1, to)
      const balance2 = await getBalance(TEST_CHAIN_ID, receiptTokenAddress, 2, to)
      const balance3 = await getBalance(TEST_CHAIN_ID, receiptTokenAddress, 3, to)

      expect(balance1?.balance).toBe(100n)
      expect(balance2?.balance).toBe(200n)
      expect(balance3?.balance).toBe(300n)
    })

    it("shares the same logIndex across batch transfers (differentiated by tokenId)", async () => {
      const receiptTokenAddress = randomAddress()
      const to = randomAddress()

      const event = buildTransferBatchEvent(
        {
          operator: to,
          from: zeroAddress,
          to,
          ids: [10n, 20n],
          values: [50n, 75n],
        },
        {
          chainId: TEST_CHAIN_ID,
          address: receiptTokenAddress,
          blockNumber: 1000n,
          blockTimestamp: BigInt(Math.floor(Date.now() / 1000)),
          logIndex: 5,
        },
      )

      await handleTransferBatch(event)

      const transfers = await getTransfers(TEST_CHAIN_ID, receiptTokenAddress)
      expect(transfers).toHaveLength(2)

      // Both should have same logIndex but different tokenIds
      expect(transfers[0]?.logIndex).toBe(5)
      expect(transfers[1]?.logIndex).toBe(5)
      expect(new Set(transfers.map((t) => t.tokenId)).size).toBe(2)
    })
  })

  describe("validation", () => {
    it("throws when blockTimestamp is missing", async () => {
      const event = buildTransferBatchEvent(
        {
          operator: randomAddress(),
          from: zeroAddress,
          to: randomAddress(),
          ids: [1n],
          values: [100n],
        },
        {
          chainId: TEST_CHAIN_ID,
        },
      )

      event.blockTimestamp = undefined

      await expect(handleTransferBatch(event)).rejects.toThrow(
        "Missing required event metadata for TransferBatch event",
      )
    })

    it("throws when ids and values length mismatch", async () => {
      const event = buildTransferBatchEvent(
        {
          operator: randomAddress(),
          from: zeroAddress,
          to: randomAddress(),
          ids: [1n, 2n, 3n],
          values: [100n, 200n], // Mismatch!
        },
        {
          chainId: TEST_CHAIN_ID,
          blockNumber: 1000n,
          blockTimestamp: BigInt(Math.floor(Date.now() / 1000)),
        },
      )

      await expect(handleTransferBatch(event)).rejects.toThrow(
        "TransferBatch ids/values length mismatch",
      )
    })

    it("handles empty batch (no-op)", async () => {
      const receiptTokenAddress = randomAddress()

      const event = buildTransferBatchEvent(
        {
          operator: randomAddress(),
          from: zeroAddress,
          to: randomAddress(),
          ids: [],
          values: [],
        },
        {
          chainId: TEST_CHAIN_ID,
          address: receiptTokenAddress,
          blockNumber: 1000n,
          blockTimestamp: BigInt(Math.floor(Date.now() / 1000)),
        },
      )

      await handleTransferBatch(event)

      // No transfers should be created
      const transfers = await getTransfers(TEST_CHAIN_ID, receiptTokenAddress)
      expect(transfers).toHaveLength(0)
    })
  })

  describe("transfer types in batch", () => {
    it("processes batch mint (from zero address)", async () => {
      const receiptTokenAddress = randomAddress()
      const to = randomAddress()

      const event = buildTransferBatchEvent(
        {
          operator: to,
          from: zeroAddress,
          to,
          ids: [1n, 2n],
          values: [100n, 200n],
        },
        {
          chainId: TEST_CHAIN_ID,
          address: receiptTokenAddress,
          blockNumber: 1000n,
          blockTimestamp: BigInt(Math.floor(Date.now() / 1000)),
        },
      )

      await handleTransferBatch(event)

      const transfers = await getTransfers(TEST_CHAIN_ID, receiptTokenAddress)
      expect(transfers.every((t) => t.type === "mint")).toBe(true)

      // Balances created for recipient
      const balance1 = await getBalance(TEST_CHAIN_ID, receiptTokenAddress, 1, to)
      const balance2 = await getBalance(TEST_CHAIN_ID, receiptTokenAddress, 2, to)
      expect(balance1?.balance).toBe(100n)
      expect(balance2?.balance).toBe(200n)
    })

    it("processes batch burn (to zero address)", async () => {
      const receiptTokenAddress = randomAddress()
      const from = randomAddress()

      // Pre-existing balances
      await insertTestBalance({
        chainId: TEST_CHAIN_ID,
        receiptTokenAddress,
        tokenId: 1,
        ownerAddress: from,
        balance: 100n,
        lastUpdateBlockNumber: 500,
        lastUpdateBlockTimestamp: new Date(500 * 1000),
      })
      await insertTestBalance({
        chainId: TEST_CHAIN_ID,
        receiptTokenAddress,
        tokenId: 2,
        ownerAddress: from,
        balance: 200n,
        lastUpdateBlockNumber: 500,
        lastUpdateBlockTimestamp: new Date(500 * 1000),
      })

      const event = buildTransferBatchEvent(
        {
          operator: from,
          from,
          to: zeroAddress,
          ids: [1n, 2n],
          values: [100n, 200n], // Full burn
        },
        {
          chainId: TEST_CHAIN_ID,
          address: receiptTokenAddress,
          blockNumber: 1000n,
          blockTimestamp: BigInt(Math.floor(Date.now() / 1000)),
        },
      )

      await handleTransferBatch(event)

      const transfers = await getTransfers(TEST_CHAIN_ID, receiptTokenAddress)
      expect(transfers.every((t) => t.type === "burn")).toBe(true)

      // Balances should be deleted
      const balance1 = await getBalance(TEST_CHAIN_ID, receiptTokenAddress, 1, from)
      const balance2 = await getBalance(TEST_CHAIN_ID, receiptTokenAddress, 2, from)
      expect(balance1).toBeUndefined()
      expect(balance2).toBeUndefined()
    })

    it("processes batch regular transfer", async () => {
      const receiptTokenAddress = randomAddress()
      const from = randomAddress()
      const to = randomAddress()

      // Pre-existing balances
      await insertTestBalance({
        chainId: TEST_CHAIN_ID,
        receiptTokenAddress,
        tokenId: 1,
        ownerAddress: from,
        balance: 100n,
        lastUpdateBlockNumber: 500,
        lastUpdateBlockTimestamp: new Date(500 * 1000),
      })
      await insertTestBalance({
        chainId: TEST_CHAIN_ID,
        receiptTokenAddress,
        tokenId: 2,
        ownerAddress: from,
        balance: 200n,
        lastUpdateBlockNumber: 500,
        lastUpdateBlockTimestamp: new Date(500 * 1000),
      })

      const event = buildTransferBatchEvent(
        {
          operator: from,
          from,
          to,
          ids: [1n, 2n],
          values: [30n, 50n],
        },
        {
          chainId: TEST_CHAIN_ID,
          address: receiptTokenAddress,
          blockNumber: 1000n,
          blockTimestamp: BigInt(Math.floor(Date.now() / 1000)),
        },
      )

      await handleTransferBatch(event)

      const transfers = await getTransfers(TEST_CHAIN_ID, receiptTokenAddress)
      expect(transfers.every((t) => t.type === "transfer")).toBe(true)

      // From balances reduced
      const fromBalance1 = await getBalance(TEST_CHAIN_ID, receiptTokenAddress, 1, from)
      const fromBalance2 = await getBalance(TEST_CHAIN_ID, receiptTokenAddress, 2, from)
      expect(fromBalance1?.balance).toBe(70n)
      expect(fromBalance2?.balance).toBe(150n)

      // To balances created
      const toBalance1 = await getBalance(TEST_CHAIN_ID, receiptTokenAddress, 1, to)
      const toBalance2 = await getBalance(TEST_CHAIN_ID, receiptTokenAddress, 2, to)
      expect(toBalance1?.balance).toBe(30n)
      expect(toBalance2?.balance).toBe(50n)
    })

    it("processes batch escrow transfer (no balance updates)", async () => {
      const receiptTokenAddress = randomAddress()
      const from = randomAddress()

      // Pre-existing balances
      await insertTestBalance({
        chainId: TEST_CHAIN_ID,
        receiptTokenAddress,
        tokenId: 1,
        ownerAddress: from,
        balance: 100n,
        lastUpdateBlockNumber: 500,
        lastUpdateBlockTimestamp: new Date(500 * 1000),
      })
      await insertTestBalance({
        chainId: TEST_CHAIN_ID,
        receiptTokenAddress,
        tokenId: 2,
        ownerAddress: from,
        balance: 200n,
        lastUpdateBlockNumber: 500,
        lastUpdateBlockTimestamp: new Date(500 * 1000),
      })

      const event = buildTransferBatchEvent(
        {
          operator: from,
          from,
          to: MARKETPLACE_ADDRESS,
          ids: [1n, 2n],
          values: [100n, 200n],
        },
        {
          chainId: TEST_CHAIN_ID,
          address: receiptTokenAddress,
          blockNumber: 1000n,
          blockTimestamp: BigInt(Math.floor(Date.now() / 1000)),
        },
      )

      await handleTransferBatch(event)

      // Transfers recorded
      const transfers = await getTransfers(TEST_CHAIN_ID, receiptTokenAddress)
      expect(transfers).toHaveLength(2)
      expect(transfers.every((t) => t.type === "marketplace")).toBe(true)

      // Balances UNCHANGED (escrow doesn't update balances)
      const fromBalance1 = await getBalance(TEST_CHAIN_ID, receiptTokenAddress, 1, from)
      const fromBalance2 = await getBalance(TEST_CHAIN_ID, receiptTokenAddress, 2, from)
      expect(fromBalance1?.balance).toBe(100n)
      expect(fromBalance2?.balance).toBe(200n)

      // Marketplace should have no balance
      const marketplaceBalance1 = await getBalance(
        TEST_CHAIN_ID,
        receiptTokenAddress,
        1,
        MARKETPLACE_ADDRESS,
      )
      expect(marketplaceBalance1).toBeUndefined()
    })
  })

  describe("atomicity", () => {
    it("rolls back all transfers if one fails", async () => {
      const receiptTokenAddress = randomAddress()
      const from = randomAddress()
      const to = randomAddress()

      // Only give balance for token 1, not token 2
      await insertTestBalance({
        chainId: TEST_CHAIN_ID,
        receiptTokenAddress,
        tokenId: 1,
        ownerAddress: from,
        balance: 100n,
        lastUpdateBlockNumber: 500,
        lastUpdateBlockTimestamp: new Date(500 * 1000),
      })
      // Token 2 has NO balance - will fail

      const event = buildTransferBatchEvent(
        {
          operator: from,
          from,
          to,
          ids: [1n, 2n], // Token 2 will fail
          values: [50n, 50n],
        },
        {
          chainId: TEST_CHAIN_ID,
          address: receiptTokenAddress,
          blockNumber: 1000n,
          blockTimestamp: BigInt(Math.floor(Date.now() / 1000)),
        },
      )

      await expect(handleTransferBatch(event)).rejects.toThrow(MissingBalanceError)

      // NO transfers should exist (rolled back)
      const transfers = await getTransfers(TEST_CHAIN_ID, receiptTokenAddress)
      expect(transfers).toHaveLength(0)

      // Token 1 balance should be unchanged (rolled back)
      const fromBalance1 = await getBalance(TEST_CHAIN_ID, receiptTokenAddress, 1, from)
      expect(fromBalance1?.balance).toBe(100n)

      // No recipient balance created (rolled back)
      const toBalance1 = await getBalance(TEST_CHAIN_ID, receiptTokenAddress, 1, to)
      expect(toBalance1).toBeUndefined()
    })
  })

  describe("complex scenarios", () => {
    it("handles batch with same recipient getting multiple tokens", async () => {
      const receiptTokenAddress = randomAddress()
      const to = randomAddress()

      // Mint 5 different tokens in one batch
      const event = buildTransferBatchEvent(
        {
          operator: to,
          from: zeroAddress,
          to,
          ids: [1n, 2n, 3n, 4n, 5n],
          values: [10n, 20n, 30n, 40n, 50n],
        },
        {
          chainId: TEST_CHAIN_ID,
          address: receiptTokenAddress,
          blockNumber: 1000n,
          blockTimestamp: BigInt(Math.floor(Date.now() / 1000)),
        },
      )

      await handleTransferBatch(event)

      // 5 transfers
      const transfers = await getTransfers(TEST_CHAIN_ID, receiptTokenAddress)
      expect(transfers).toHaveLength(5)

      // 5 separate balances
      for (let i = 1; i <= 5; i++) {
        // oxlint-disable-next-line no-await-in-loop
        const balance = await getBalance(TEST_CHAIN_ID, receiptTokenAddress, i, to)
        expect(balance?.balance).toBe(BigInt(i * 10))
      }
    })

    it("handles batch transfer then subsequent batch transfer", async () => {
      const receiptTokenAddress = randomAddress()
      const alice = randomAddress()
      const bob = randomAddress()

      // Batch mint to Alice
      const batchEvent = buildTransferBatchEvent(
        {
          operator: alice,
          from: zeroAddress,
          to: alice,
          ids: [1n, 2n],
          values: [100n, 200n],
        },
        {
          chainId: TEST_CHAIN_ID,
          address: receiptTokenAddress,
          blockNumber: 1000n,
          blockTimestamp: 1000n,
          logIndex: 0,
        },
      )

      await handleTransferBatch(batchEvent)

      // Batch transfer from Alice to Bob (token 1 only)
      const secondBatch = buildTransferBatchEvent(
        {
          operator: alice,
          from: alice,
          to: bob,
          ids: [1n],
          values: [30n],
        },
        {
          chainId: TEST_CHAIN_ID,
          address: receiptTokenAddress,
          blockNumber: 2000n,
          blockTimestamp: 2000n,
          logIndex: 0,
        },
      )

      await handleTransferBatch(secondBatch)

      // Check final balances
      const aliceBalance1 = await getBalance(TEST_CHAIN_ID, receiptTokenAddress, 1, alice)
      const aliceBalance2 = await getBalance(TEST_CHAIN_ID, receiptTokenAddress, 2, alice)
      const bobBalance1 = await getBalance(TEST_CHAIN_ID, receiptTokenAddress, 1, bob)

      expect(aliceBalance1?.balance).toBe(70n)
      expect(aliceBalance2?.balance).toBe(200n)
      expect(bobBalance1?.balance).toBe(30n)
    })
  })
})

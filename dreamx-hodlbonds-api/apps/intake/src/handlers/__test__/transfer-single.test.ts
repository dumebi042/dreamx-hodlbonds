/**
 * Tests for TransferSingle event handler
 * Verifies transfer insertion, balance updates, and escrow handling
 */

import { faker } from "@faker-js/faker"
import { getDb } from "@hodlbonds-api/db"
import { receiptTokenBalances, receiptTokenTransfers, schema } from "@hodlbonds-api/db/schema/index"
import { and, eq } from "drizzle-orm"
import { reset } from "drizzle-seed"
import { getAddress, zeroAddress } from "viem"
import { beforeEach, describe, expect, it } from "vitest"

import { buildTransferSingleEvent } from "../../test/helpers/event-builders"
import { ESCROW_ADDRESSES, handleTransferSingle, MissingBalanceError } from "../transfer-single"

const db = getDb()

// Test chain ID - has escrow addresses configured
const TEST_CHAIN_ID = 1337

// Get escrow addresses for test chain
const MARKETPLACE_ADDRESS = getAddress(
  Object.keys(ESCROW_ADDRESSES[TEST_CHAIN_ID]!).find(
    (addr) => ESCROW_ADDRESSES[TEST_CHAIN_ID]![addr] === "marketplace",
  )!,
)
const LOAN_ADDRESS = getAddress(
  Object.keys(ESCROW_ADDRESSES[TEST_CHAIN_ID]!).find(
    (addr) => ESCROW_ADDRESSES[TEST_CHAIN_ID]![addr] === "loan",
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

// Helper to get all transfers for a token
async function getTransfers(chainId: number, receiptTokenAddress: string, tokenId: number) {
  return await db
    .select()
    .from(receiptTokenTransfers)
    .where(
      and(
        eq(receiptTokenTransfers.chainId, chainId),
        eq(receiptTokenTransfers.receiptTokenAddress, receiptTokenAddress),
        eq(receiptTokenTransfers.tokenId, tokenId),
      ),
    )
}

describe("handleTransferSingle", () => {
  beforeEach(async () => {
    await reset(db, schema)
  })

  describe("transfer record insertion", () => {
    it("inserts transfer record with correct data", async () => {
      const receiptTokenAddress = randomAddress()
      const from = randomAddress()
      const to = randomAddress()
      const operator = randomAddress()
      const blockTimestamp = BigInt(Math.floor(Date.now() / 1000))
      const txHash = faker.string.hexadecimal({ length: 64, prefix: "0x" }) as `0x${string}`

      // Need a balance for 'from' since this is a regular transfer
      await insertTestBalance({
        chainId: TEST_CHAIN_ID,
        receiptTokenAddress,
        tokenId: 1,
        ownerAddress: from,
        balance: 100n,
        lastUpdateBlockNumber: 1000,
        lastUpdateBlockTimestamp: new Date(1000 * 1000),
      })

      const event = buildTransferSingleEvent(
        {
          operator,
          from,
          to,
          id: 1n,
          value: 50n,
        },
        {
          chainId: TEST_CHAIN_ID,
          address: receiptTokenAddress,
          transactionHash: txHash,
          blockNumber: 12345678n,
          blockTimestamp,
          logIndex: 3,
        },
      )

      await handleTransferSingle(event)

      const transfers = await getTransfers(TEST_CHAIN_ID, receiptTokenAddress, 1)
      expect(transfers).toHaveLength(1)
      expect(transfers[0]?.txHash).toBe(txHash)
      expect(transfers[0]?.logIndex).toBe(3)
      expect(transfers[0]?.blockNumber).toBe(12345678)
      expect(transfers[0]?.type).toBe("transfer")
      expect(transfers[0]?.receiptTokenAddress).toBe(receiptTokenAddress)
      expect(transfers[0]?.tokenId).toBe(1)
      expect(transfers[0]?.from).toBe(from)
      expect(transfers[0]?.to).toBe(to)
      expect(transfers[0]?.amount).toBe(50n)
    })

    it("checksums addresses in transfer record", async () => {
      const receiptTokenAddress = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as `0x${string}`
      const from = zeroAddress // Mint - no balance needed
      const to = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as `0x${string}`

      const event = buildTransferSingleEvent(
        {
          operator: to,
          from,
          to,
          id: 1n,
          value: 100n,
        },
        {
          chainId: TEST_CHAIN_ID,
          address: receiptTokenAddress,
          blockNumber: 1000n,
          blockTimestamp: BigInt(Math.floor(Date.now() / 1000)),
        },
      )

      await handleTransferSingle(event)

      const transfers = await getTransfers(TEST_CHAIN_ID, getAddress(receiptTokenAddress), 1)
      expect(transfers).toHaveLength(1)
      expect(transfers[0]?.receiptTokenAddress).toBe(getAddress(receiptTokenAddress))
      expect(transfers[0]?.to).toBe(getAddress(to))
    })

    it("throws when blockTimestamp is missing", async () => {
      const event = buildTransferSingleEvent(
        {
          operator: randomAddress(),
          from: zeroAddress,
          to: randomAddress(),
          id: 1n,
          value: 100n,
        },
        {
          chainId: TEST_CHAIN_ID,
          transactionHash: "0xdeadbeef00000000000000000000000000000000000000000000000000000000",
        },
      )

      event.blockTimestamp = undefined

      await expect(handleTransferSingle(event)).rejects.toThrow(
        "Missing required event metadata for TransferSingle event",
      )
    })
  })

  describe("transfer type determination", () => {
    it("returns 'mint' when from is zero address", async () => {
      const receiptTokenAddress = randomAddress()
      const to = randomAddress()

      const event = buildTransferSingleEvent(
        {
          operator: to,
          from: zeroAddress,
          to,
          id: 1n,
          value: 100n,
        },
        {
          chainId: TEST_CHAIN_ID,
          address: receiptTokenAddress,
          blockNumber: 1000n,
          blockTimestamp: BigInt(Math.floor(Date.now() / 1000)),
        },
      )

      await handleTransferSingle(event)

      const transfers = await getTransfers(TEST_CHAIN_ID, receiptTokenAddress, 1)
      expect(transfers[0]?.type).toBe("mint")
    })

    it("returns 'burn' when to is zero address", async () => {
      const receiptTokenAddress = randomAddress()
      const from = randomAddress()

      await insertTestBalance({
        chainId: TEST_CHAIN_ID,
        receiptTokenAddress,
        tokenId: 1,
        ownerAddress: from,
        balance: 100n,
        lastUpdateBlockNumber: 1000,
        lastUpdateBlockTimestamp: new Date(1000 * 1000),
      })

      const event = buildTransferSingleEvent(
        {
          operator: from,
          from,
          to: zeroAddress,
          id: 1n,
          value: 50n,
        },
        {
          chainId: TEST_CHAIN_ID,
          address: receiptTokenAddress,
          blockNumber: 2000n,
          blockTimestamp: BigInt(Math.floor(Date.now() / 1000)),
        },
      )

      await handleTransferSingle(event)

      const transfers = await getTransfers(TEST_CHAIN_ID, receiptTokenAddress, 1)
      expect(transfers[0]?.type).toBe("burn")
    })

    it("returns 'marketplace' when to is marketplace address", async () => {
      const receiptTokenAddress = randomAddress()
      const from = randomAddress()

      await insertTestBalance({
        chainId: TEST_CHAIN_ID,
        receiptTokenAddress,
        tokenId: 1,
        ownerAddress: from,
        balance: 100n,
        lastUpdateBlockNumber: 1000,
        lastUpdateBlockTimestamp: new Date(1000 * 1000),
      })

      const event = buildTransferSingleEvent(
        {
          operator: from,
          from,
          to: MARKETPLACE_ADDRESS,
          id: 1n,
          value: 100n,
        },
        {
          chainId: TEST_CHAIN_ID,
          address: receiptTokenAddress,
          blockNumber: 2000n,
          blockTimestamp: BigInt(Math.floor(Date.now() / 1000)),
        },
      )

      await handleTransferSingle(event)

      const transfers = await getTransfers(TEST_CHAIN_ID, receiptTokenAddress, 1)
      expect(transfers[0]?.type).toBe("marketplace")
    })

    it("returns 'marketplace' when from is marketplace address", async () => {
      const receiptTokenAddress = randomAddress()
      const to = randomAddress()

      const event = buildTransferSingleEvent(
        {
          operator: MARKETPLACE_ADDRESS,
          from: MARKETPLACE_ADDRESS,
          to,
          id: 1n,
          value: 100n,
        },
        {
          chainId: TEST_CHAIN_ID,
          address: receiptTokenAddress,
          blockNumber: 2000n,
          blockTimestamp: BigInt(Math.floor(Date.now() / 1000)),
        },
      )

      await handleTransferSingle(event)

      const transfers = await getTransfers(TEST_CHAIN_ID, receiptTokenAddress, 1)
      expect(transfers[0]?.type).toBe("marketplace")
    })

    it("returns 'loan' when to is loan address", async () => {
      const receiptTokenAddress = randomAddress()
      const from = randomAddress()

      await insertTestBalance({
        chainId: TEST_CHAIN_ID,
        receiptTokenAddress,
        tokenId: 1,
        ownerAddress: from,
        balance: 100n,
        lastUpdateBlockNumber: 1000,
        lastUpdateBlockTimestamp: new Date(1000 * 1000),
      })

      const event = buildTransferSingleEvent(
        {
          operator: from,
          from,
          to: LOAN_ADDRESS,
          id: 1n,
          value: 100n,
        },
        {
          chainId: TEST_CHAIN_ID,
          address: receiptTokenAddress,
          blockNumber: 2000n,
          blockTimestamp: BigInt(Math.floor(Date.now() / 1000)),
        },
      )

      await handleTransferSingle(event)

      const transfers = await getTransfers(TEST_CHAIN_ID, receiptTokenAddress, 1)
      expect(transfers[0]?.type).toBe("loan")
    })

    it("returns 'loan' when from is loan address", async () => {
      const receiptTokenAddress = randomAddress()
      const to = randomAddress()

      const event = buildTransferSingleEvent(
        {
          operator: LOAN_ADDRESS,
          from: LOAN_ADDRESS,
          to,
          id: 1n,
          value: 100n,
        },
        {
          chainId: TEST_CHAIN_ID,
          address: receiptTokenAddress,
          blockNumber: 2000n,
          blockTimestamp: BigInt(Math.floor(Date.now() / 1000)),
        },
      )

      await handleTransferSingle(event)

      const transfers = await getTransfers(TEST_CHAIN_ID, receiptTokenAddress, 1)
      expect(transfers[0]?.type).toBe("loan")
    })

    it("returns 'transfer' for regular addresses", async () => {
      const receiptTokenAddress = randomAddress()
      const from = randomAddress()
      const to = randomAddress()

      await insertTestBalance({
        chainId: TEST_CHAIN_ID,
        receiptTokenAddress,
        tokenId: 1,
        ownerAddress: from,
        balance: 100n,
        lastUpdateBlockNumber: 1000,
        lastUpdateBlockTimestamp: new Date(1000 * 1000),
      })

      const event = buildTransferSingleEvent(
        {
          operator: from,
          from,
          to,
          id: 1n,
          value: 50n,
        },
        {
          chainId: TEST_CHAIN_ID,
          address: receiptTokenAddress,
          blockNumber: 2000n,
          blockTimestamp: BigInt(Math.floor(Date.now() / 1000)),
        },
      )

      await handleTransferSingle(event)

      const transfers = await getTransfers(TEST_CHAIN_ID, receiptTokenAddress, 1)
      expect(transfers[0]?.type).toBe("transfer")
    })
  })

  describe("mint transfers (from=0x0)", () => {
    it("creates new balance entry for recipient", async () => {
      const receiptTokenAddress = randomAddress()
      const to = randomAddress()
      const blockTimestamp = BigInt(Math.floor(Date.now() / 1000))

      const event = buildTransferSingleEvent(
        {
          operator: to,
          from: zeroAddress,
          to,
          id: 1n,
          value: 100n,
        },
        {
          chainId: TEST_CHAIN_ID,
          address: receiptTokenAddress,
          blockNumber: 5000n,
          blockTimestamp,
        },
      )

      await handleTransferSingle(event)

      const balance = await getBalance(TEST_CHAIN_ID, receiptTokenAddress, 1, to)
      expect(balance).toBeDefined()
      expect(balance?.balance).toBe(100n)
      expect(balance?.lastUpdateBlockNumber).toBe(5000)
    })

    it("adds to existing recipient balance", async () => {
      const receiptTokenAddress = randomAddress()
      const to = randomAddress()

      // Pre-existing balance
      await insertTestBalance({
        chainId: TEST_CHAIN_ID,
        receiptTokenAddress,
        tokenId: 1,
        ownerAddress: to,
        balance: 50n,
        lastUpdateBlockNumber: 1000,
        lastUpdateBlockTimestamp: new Date(1000 * 1000),
      })

      const event = buildTransferSingleEvent(
        {
          operator: to,
          from: zeroAddress,
          to,
          id: 1n,
          value: 30n,
        },
        {
          chainId: TEST_CHAIN_ID,
          address: receiptTokenAddress,
          blockNumber: 2000n,
          blockTimestamp: BigInt(Math.floor(Date.now() / 1000)),
        },
      )

      await handleTransferSingle(event)

      const balance = await getBalance(TEST_CHAIN_ID, receiptTokenAddress, 1, to)
      expect(balance?.balance).toBe(80n)
    })

    it("does NOT try to update sender balance for zero address", async () => {
      const receiptTokenAddress = randomAddress()
      const to = randomAddress()

      const event = buildTransferSingleEvent(
        {
          operator: to,
          from: zeroAddress,
          to,
          id: 1n,
          value: 100n,
        },
        {
          chainId: TEST_CHAIN_ID,
          address: receiptTokenAddress,
          blockNumber: 1000n,
          blockTimestamp: BigInt(Math.floor(Date.now() / 1000)),
        },
      )

      // Should not throw MissingBalanceError for zero address
      await expect(handleTransferSingle(event)).resolves.not.toThrow()

      // Zero address should have no balance entry
      const zeroBalance = await getBalance(TEST_CHAIN_ID, receiptTokenAddress, 1, zeroAddress)
      expect(zeroBalance).toBeUndefined()
    })

    it("updates timestamps when newer", async () => {
      const receiptTokenAddress = randomAddress()
      const to = randomAddress()
      const oldTimestamp = new Date(1000 * 1000)
      const newTimestamp = new Date(2000 * 1000)

      await insertTestBalance({
        chainId: TEST_CHAIN_ID,
        receiptTokenAddress,
        tokenId: 1,
        ownerAddress: to,
        balance: 50n,
        lastUpdateBlockNumber: 1000,
        lastUpdateBlockTimestamp: oldTimestamp,
      })

      const event = buildTransferSingleEvent(
        {
          operator: to,
          from: zeroAddress,
          to,
          id: 1n,
          value: 30n,
        },
        {
          chainId: TEST_CHAIN_ID,
          address: receiptTokenAddress,
          blockNumber: 2000n,
          blockTimestamp: 2000n,
        },
      )

      await handleTransferSingle(event)

      const balance = await getBalance(TEST_CHAIN_ID, receiptTokenAddress, 1, to)
      expect(balance?.lastUpdateBlockNumber).toBe(2000)
      expect(balance?.lastUpdateBlockTimestamp).toEqual(newTimestamp)
    })
  })

  describe("burn transfers (to=0x0)", () => {
    it("subtracts from sender balance", async () => {
      const receiptTokenAddress = randomAddress()
      const from = randomAddress()

      await insertTestBalance({
        chainId: TEST_CHAIN_ID,
        receiptTokenAddress,
        tokenId: 1,
        ownerAddress: from,
        balance: 100n,
        lastUpdateBlockNumber: 1000,
        lastUpdateBlockTimestamp: new Date(1000 * 1000),
      })

      const event = buildTransferSingleEvent(
        {
          operator: from,
          from,
          to: zeroAddress,
          id: 1n,
          value: 30n,
        },
        {
          chainId: TEST_CHAIN_ID,
          address: receiptTokenAddress,
          blockNumber: 2000n,
          blockTimestamp: BigInt(Math.floor(Date.now() / 1000)),
        },
      )

      await handleTransferSingle(event)

      const balance = await getBalance(TEST_CHAIN_ID, receiptTokenAddress, 1, from)
      expect(balance?.balance).toBe(70n)
    })

    it("deletes sender balance when it reaches zero", async () => {
      const receiptTokenAddress = randomAddress()
      const from = randomAddress()

      await insertTestBalance({
        chainId: TEST_CHAIN_ID,
        receiptTokenAddress,
        tokenId: 1,
        ownerAddress: from,
        balance: 100n,
        lastUpdateBlockNumber: 1000,
        lastUpdateBlockTimestamp: new Date(1000 * 1000),
      })

      const event = buildTransferSingleEvent(
        {
          operator: from,
          from,
          to: zeroAddress,
          id: 1n,
          value: 100n,
        },
        {
          chainId: TEST_CHAIN_ID,
          address: receiptTokenAddress,
          blockNumber: 2000n,
          blockTimestamp: BigInt(Math.floor(Date.now() / 1000)),
        },
      )

      await handleTransferSingle(event)

      const balance = await getBalance(TEST_CHAIN_ID, receiptTokenAddress, 1, from)
      expect(balance).toBeUndefined()
    })

    it("does NOT create balance entry for zero address recipient", async () => {
      const receiptTokenAddress = randomAddress()
      const from = randomAddress()

      await insertTestBalance({
        chainId: TEST_CHAIN_ID,
        receiptTokenAddress,
        tokenId: 1,
        ownerAddress: from,
        balance: 100n,
        lastUpdateBlockNumber: 1000,
        lastUpdateBlockTimestamp: new Date(1000 * 1000),
      })

      const event = buildTransferSingleEvent(
        {
          operator: from,
          from,
          to: zeroAddress,
          id: 1n,
          value: 50n,
        },
        {
          chainId: TEST_CHAIN_ID,
          address: receiptTokenAddress,
          blockNumber: 2000n,
          blockTimestamp: BigInt(Math.floor(Date.now() / 1000)),
        },
      )

      await handleTransferSingle(event)

      const zeroBalance = await getBalance(TEST_CHAIN_ID, receiptTokenAddress, 1, zeroAddress)
      expect(zeroBalance).toBeUndefined()
    })

    it("throws MissingBalanceError when sender has no balance", async () => {
      const receiptTokenAddress = randomAddress()
      const from = randomAddress()

      const event = buildTransferSingleEvent(
        {
          operator: from,
          from,
          to: zeroAddress,
          id: 1n,
          value: 50n,
        },
        {
          chainId: TEST_CHAIN_ID,
          address: receiptTokenAddress,
          blockNumber: 2000n,
          blockTimestamp: BigInt(Math.floor(Date.now() / 1000)),
        },
      )

      await expect(handleTransferSingle(event)).rejects.toThrow(MissingBalanceError)
    })
  })

  describe("regular transfers", () => {
    it("subtracts from sender and adds to recipient", async () => {
      const receiptTokenAddress = randomAddress()
      const from = randomAddress()
      const to = randomAddress()

      await insertTestBalance({
        chainId: TEST_CHAIN_ID,
        receiptTokenAddress,
        tokenId: 1,
        ownerAddress: from,
        balance: 100n,
        lastUpdateBlockNumber: 1000,
        lastUpdateBlockTimestamp: new Date(1000 * 1000),
      })

      const event = buildTransferSingleEvent(
        {
          operator: from,
          from,
          to,
          id: 1n,
          value: 40n,
        },
        {
          chainId: TEST_CHAIN_ID,
          address: receiptTokenAddress,
          blockNumber: 2000n,
          blockTimestamp: BigInt(Math.floor(Date.now() / 1000)),
        },
      )

      await handleTransferSingle(event)

      const fromBalance = await getBalance(TEST_CHAIN_ID, receiptTokenAddress, 1, from)
      const toBalance = await getBalance(TEST_CHAIN_ID, receiptTokenAddress, 1, to)

      expect(fromBalance?.balance).toBe(60n)
      expect(toBalance?.balance).toBe(40n)
    })

    it("creates new recipient balance if doesn't exist", async () => {
      const receiptTokenAddress = randomAddress()
      const from = randomAddress()
      const to = randomAddress()

      await insertTestBalance({
        chainId: TEST_CHAIN_ID,
        receiptTokenAddress,
        tokenId: 1,
        ownerAddress: from,
        balance: 100n,
        lastUpdateBlockNumber: 1000,
        lastUpdateBlockTimestamp: new Date(1000 * 1000),
      })

      const event = buildTransferSingleEvent(
        {
          operator: from,
          from,
          to,
          id: 1n,
          value: 25n,
        },
        {
          chainId: TEST_CHAIN_ID,
          address: receiptTokenAddress,
          blockNumber: 2000n,
          blockTimestamp: BigInt(Math.floor(Date.now() / 1000)),
        },
      )

      await handleTransferSingle(event)

      const toBalance = await getBalance(TEST_CHAIN_ID, receiptTokenAddress, 1, to)
      expect(toBalance).toBeDefined()
      expect(toBalance?.balance).toBe(25n)
    })

    it("deletes sender balance when it reaches zero", async () => {
      const receiptTokenAddress = randomAddress()
      const from = randomAddress()
      const to = randomAddress()

      await insertTestBalance({
        chainId: TEST_CHAIN_ID,
        receiptTokenAddress,
        tokenId: 1,
        ownerAddress: from,
        balance: 100n,
        lastUpdateBlockNumber: 1000,
        lastUpdateBlockTimestamp: new Date(1000 * 1000),
      })

      const event = buildTransferSingleEvent(
        {
          operator: from,
          from,
          to,
          id: 1n,
          value: 100n,
        },
        {
          chainId: TEST_CHAIN_ID,
          address: receiptTokenAddress,
          blockNumber: 2000n,
          blockTimestamp: BigInt(Math.floor(Date.now() / 1000)),
        },
      )

      await handleTransferSingle(event)

      const fromBalance = await getBalance(TEST_CHAIN_ID, receiptTokenAddress, 1, from)
      expect(fromBalance).toBeUndefined()

      const toBalance = await getBalance(TEST_CHAIN_ID, receiptTokenAddress, 1, to)
      expect(toBalance?.balance).toBe(100n)
    })

    it("throws MissingBalanceError when sender has no balance", async () => {
      const receiptTokenAddress = randomAddress()
      const from = randomAddress()
      const to = randomAddress()

      const event = buildTransferSingleEvent(
        {
          operator: from,
          from,
          to,
          id: 1n,
          value: 50n,
        },
        {
          chainId: TEST_CHAIN_ID,
          address: receiptTokenAddress,
          blockNumber: 2000n,
          blockTimestamp: BigInt(Math.floor(Date.now() / 1000)),
        },
      )

      await expect(handleTransferSingle(event)).rejects.toThrow(MissingBalanceError)
    })
  })

  describe("escrow transfers (marketplace)", () => {
    it("inserts transfer record but does NOT update sender balance (to marketplace)", async () => {
      const receiptTokenAddress = randomAddress()
      const from = randomAddress()

      await insertTestBalance({
        chainId: TEST_CHAIN_ID,
        receiptTokenAddress,
        tokenId: 1,
        ownerAddress: from,
        balance: 100n,
        lastUpdateBlockNumber: 1000,
        lastUpdateBlockTimestamp: new Date(1000 * 1000),
      })

      const event = buildTransferSingleEvent(
        {
          operator: from,
          from,
          to: MARKETPLACE_ADDRESS,
          id: 1n,
          value: 100n,
        },
        {
          chainId: TEST_CHAIN_ID,
          address: receiptTokenAddress,
          blockNumber: 2000n,
          blockTimestamp: BigInt(Math.floor(Date.now() / 1000)),
        },
      )

      await handleTransferSingle(event)

      // Transfer should be recorded
      const transfers = await getTransfers(TEST_CHAIN_ID, receiptTokenAddress, 1)
      expect(transfers).toHaveLength(1)
      expect(transfers[0]?.type).toBe("marketplace")

      // Sender balance should be UNCHANGED (still 100, not 0)
      const fromBalance = await getBalance(TEST_CHAIN_ID, receiptTokenAddress, 1, from)
      expect(fromBalance?.balance).toBe(100n)

      // Marketplace should have no balance entry
      const marketplaceBalance = await getBalance(
        TEST_CHAIN_ID,
        receiptTokenAddress,
        1,
        MARKETPLACE_ADDRESS,
      )
      expect(marketplaceBalance).toBeUndefined()
    })

    it("inserts transfer record but does NOT update recipient balance (from marketplace)", async () => {
      const receiptTokenAddress = randomAddress()
      const to = randomAddress()

      const event = buildTransferSingleEvent(
        {
          operator: MARKETPLACE_ADDRESS,
          from: MARKETPLACE_ADDRESS,
          to,
          id: 1n,
          value: 100n,
        },
        {
          chainId: TEST_CHAIN_ID,
          address: receiptTokenAddress,
          blockNumber: 2000n,
          blockTimestamp: BigInt(Math.floor(Date.now() / 1000)),
        },
      )

      await handleTransferSingle(event)

      // Transfer should be recorded
      const transfers = await getTransfers(TEST_CHAIN_ID, receiptTokenAddress, 1)
      expect(transfers).toHaveLength(1)
      expect(transfers[0]?.type).toBe("marketplace")

      // Recipient should have no balance created
      const toBalance = await getBalance(TEST_CHAIN_ID, receiptTokenAddress, 1, to)
      expect(toBalance).toBeUndefined()
    })
  })

  describe("escrow transfers (loan)", () => {
    it("inserts transfer record but does NOT update sender balance (to loan)", async () => {
      const receiptTokenAddress = randomAddress()
      const from = randomAddress()

      await insertTestBalance({
        chainId: TEST_CHAIN_ID,
        receiptTokenAddress,
        tokenId: 1,
        ownerAddress: from,
        balance: 100n,
        lastUpdateBlockNumber: 1000,
        lastUpdateBlockTimestamp: new Date(1000 * 1000),
      })

      const event = buildTransferSingleEvent(
        {
          operator: from,
          from,
          to: LOAN_ADDRESS,
          id: 1n,
          value: 100n,
        },
        {
          chainId: TEST_CHAIN_ID,
          address: receiptTokenAddress,
          blockNumber: 2000n,
          blockTimestamp: BigInt(Math.floor(Date.now() / 1000)),
        },
      )

      await handleTransferSingle(event)

      // Transfer should be recorded
      const transfers = await getTransfers(TEST_CHAIN_ID, receiptTokenAddress, 1)
      expect(transfers).toHaveLength(1)
      expect(transfers[0]?.type).toBe("loan")

      // Sender balance should be UNCHANGED
      const fromBalance = await getBalance(TEST_CHAIN_ID, receiptTokenAddress, 1, from)
      expect(fromBalance?.balance).toBe(100n)

      // Loan contract should have no balance entry
      const loanBalance = await getBalance(TEST_CHAIN_ID, receiptTokenAddress, 1, LOAN_ADDRESS)
      expect(loanBalance).toBeUndefined()
    })

    it("inserts transfer record but does NOT update recipient balance (from loan)", async () => {
      const receiptTokenAddress = randomAddress()
      const to = randomAddress()

      const event = buildTransferSingleEvent(
        {
          operator: LOAN_ADDRESS,
          from: LOAN_ADDRESS,
          to,
          id: 1n,
          value: 100n,
        },
        {
          chainId: TEST_CHAIN_ID,
          address: receiptTokenAddress,
          blockNumber: 2000n,
          blockTimestamp: BigInt(Math.floor(Date.now() / 1000)),
        },
      )

      await handleTransferSingle(event)

      // Transfer should be recorded
      const transfers = await getTransfers(TEST_CHAIN_ID, receiptTokenAddress, 1)
      expect(transfers).toHaveLength(1)
      expect(transfers[0]?.type).toBe("loan")

      // Recipient should have no balance created
      const toBalance = await getBalance(TEST_CHAIN_ID, receiptTokenAddress, 1, to)
      expect(toBalance).toBeUndefined()
    })
  })

  describe("out-of-order event processing", () => {
    it("always updates balances regardless of order (commutative)", async () => {
      const receiptTokenAddress = randomAddress()
      const alice = randomAddress()
      const bob = randomAddress()

      // Start with Alice having 100 tokens
      await insertTestBalance({
        chainId: TEST_CHAIN_ID,
        receiptTokenAddress,
        tokenId: 1,
        ownerAddress: alice,
        balance: 100n,
        lastUpdateBlockNumber: 500,
        lastUpdateBlockTimestamp: new Date(500 * 1000),
      })

      // Event A (block 1000): Alice sends 30 to Bob
      const eventA = buildTransferSingleEvent(
        {
          operator: alice,
          from: alice,
          to: bob,
          id: 1n,
          value: 30n,
        },
        {
          chainId: TEST_CHAIN_ID,
          address: receiptTokenAddress,
          blockNumber: 1000n,
          blockTimestamp: 1000n,
          logIndex: 0,
        },
      )

      // Event B (block 999): Alice sends 20 to Bob - arrives AFTER A
      const eventB = buildTransferSingleEvent(
        {
          operator: alice,
          from: alice,
          to: bob,
          id: 1n,
          value: 20n,
        },
        {
          chainId: TEST_CHAIN_ID,
          address: receiptTokenAddress,
          blockNumber: 999n,
          blockTimestamp: 999n,
          logIndex: 0,
        },
      )

      // Process in wrong order
      await handleTransferSingle(eventA) // Block 1000 first
      await handleTransferSingle(eventB) // Block 999 second

      // Final balances should be correct: Alice=50, Bob=50
      const aliceBalance = await getBalance(TEST_CHAIN_ID, receiptTokenAddress, 1, alice)
      const bobBalance = await getBalance(TEST_CHAIN_ID, receiptTokenAddress, 1, bob)

      expect(aliceBalance?.balance).toBe(50n)
      expect(bobBalance?.balance).toBe(50n)
    })

    it("only updates timestamps when block is newer", async () => {
      const receiptTokenAddress = randomAddress()
      const to = randomAddress()

      // Mint at block 2000
      const newerEvent = buildTransferSingleEvent(
        {
          operator: to,
          from: zeroAddress,
          to,
          id: 1n,
          value: 50n,
        },
        {
          chainId: TEST_CHAIN_ID,
          address: receiptTokenAddress,
          blockNumber: 2000n,
          blockTimestamp: 2000n,
        },
      )

      // Mint at block 1000 (arrives later)
      const olderEvent = buildTransferSingleEvent(
        {
          operator: to,
          from: zeroAddress,
          to,
          id: 1n,
          value: 30n,
        },
        {
          chainId: TEST_CHAIN_ID,
          address: receiptTokenAddress,
          blockNumber: 1000n,
          blockTimestamp: 1000n,
          logIndex: 1, // Different logIndex to avoid PK conflict
        },
      )

      await handleTransferSingle(newerEvent)
      await handleTransferSingle(olderEvent)

      const balance = await getBalance(TEST_CHAIN_ID, receiptTokenAddress, 1, to)

      // Balance should be sum of both
      expect(balance?.balance).toBe(80n)

      // Timestamp should be from newer block
      expect(balance?.lastUpdateBlockNumber).toBe(2000)
    })
  })

  describe("duplicate prevention", () => {
    it("fails on duplicate (chainId, txHash, logIndex)", async () => {
      const receiptTokenAddress = randomAddress()
      const to = randomAddress()
      const txHash = faker.string.hexadecimal({ length: 64, prefix: "0x" }) as `0x${string}`

      const event = buildTransferSingleEvent(
        {
          operator: to,
          from: zeroAddress,
          to,
          id: 1n,
          value: 100n,
        },
        {
          chainId: TEST_CHAIN_ID,
          address: receiptTokenAddress,
          transactionHash: txHash,
          blockNumber: 1000n,
          blockTimestamp: BigInt(Math.floor(Date.now() / 1000)),
          logIndex: 0,
        },
      )

      // First should succeed
      await handleTransferSingle(event)

      // Second should fail
      await expect(handleTransferSingle(event)).rejects.toThrow(
        /Failed query: insert into "receipt_token_transfers"/,
      )

      // Only one transfer should exist
      const transfers = await getTransfers(TEST_CHAIN_ID, receiptTokenAddress, 1)
      expect(transfers).toHaveLength(1)
    })
  })

  describe("edge cases", () => {
    it("handles zero-value transfer", async () => {
      const receiptTokenAddress = randomAddress()
      const from = randomAddress()
      const to = randomAddress()

      await insertTestBalance({
        chainId: TEST_CHAIN_ID,
        receiptTokenAddress,
        tokenId: 1,
        ownerAddress: from,
        balance: 100n,
        lastUpdateBlockNumber: 1000,
        lastUpdateBlockTimestamp: new Date(1000 * 1000),
      })

      const event = buildTransferSingleEvent(
        {
          operator: from,
          from,
          to,
          id: 1n,
          value: 0n,
        },
        {
          chainId: TEST_CHAIN_ID,
          address: receiptTokenAddress,
          blockNumber: 2000n,
          blockTimestamp: BigInt(Math.floor(Date.now() / 1000)),
        },
      )

      await handleTransferSingle(event)

      // Transfer should be recorded
      const transfers = await getTransfers(TEST_CHAIN_ID, receiptTokenAddress, 1)
      expect(transfers).toHaveLength(1)
      expect(transfers[0]?.amount).toBe(0n)

      // Balances should be unchanged
      const fromBalance = await getBalance(TEST_CHAIN_ID, receiptTokenAddress, 1, from)
      expect(fromBalance?.balance).toBe(100n)

      // Recipient should have 0 balance entry created
      const toBalance = await getBalance(TEST_CHAIN_ID, receiptTokenAddress, 1, to)
      expect(toBalance?.balance).toBe(0n)
    })

    it("handles multiple sequential transfers correctly", async () => {
      const receiptTokenAddress = randomAddress()
      const alice = randomAddress()
      const bob = randomAddress()
      const charlie = randomAddress()

      // Mint 100 to Alice
      const mintEvent = buildTransferSingleEvent(
        {
          operator: alice,
          from: zeroAddress,
          to: alice,
          id: 1n,
          value: 100n,
        },
        {
          chainId: TEST_CHAIN_ID,
          address: receiptTokenAddress,
          blockNumber: 1000n,
          blockTimestamp: 1000n,
          logIndex: 0,
        },
      )

      // Alice sends 40 to Bob
      const transfer1 = buildTransferSingleEvent(
        {
          operator: alice,
          from: alice,
          to: bob,
          id: 1n,
          value: 40n,
        },
        {
          chainId: TEST_CHAIN_ID,
          address: receiptTokenAddress,
          blockNumber: 2000n,
          blockTimestamp: 2000n,
          logIndex: 0,
        },
      )

      // Bob sends 15 to Charlie
      const transfer2 = buildTransferSingleEvent(
        {
          operator: bob,
          from: bob,
          to: charlie,
          id: 1n,
          value: 15n,
        },
        {
          chainId: TEST_CHAIN_ID,
          address: receiptTokenAddress,
          blockNumber: 3000n,
          blockTimestamp: 3000n,
          logIndex: 0,
        },
      )

      // Alice burns 30
      const burnEvent = buildTransferSingleEvent(
        {
          operator: alice,
          from: alice,
          to: zeroAddress,
          id: 1n,
          value: 30n,
        },
        {
          chainId: TEST_CHAIN_ID,
          address: receiptTokenAddress,
          blockNumber: 4000n,
          blockTimestamp: 4000n,
          logIndex: 0,
        },
      )

      await handleTransferSingle(mintEvent)
      await handleTransferSingle(transfer1)
      await handleTransferSingle(transfer2)
      await handleTransferSingle(burnEvent)

      // Final balances: Alice=30, Bob=25, Charlie=15 (total=70, 30 burned)
      const aliceBalance = await getBalance(TEST_CHAIN_ID, receiptTokenAddress, 1, alice)
      const bobBalance = await getBalance(TEST_CHAIN_ID, receiptTokenAddress, 1, bob)
      const charlieBalance = await getBalance(TEST_CHAIN_ID, receiptTokenAddress, 1, charlie)

      expect(aliceBalance?.balance).toBe(30n)
      expect(bobBalance?.balance).toBe(25n)
      expect(charlieBalance?.balance).toBe(15n)

      // Should have 4 transfer records
      const transfers = await getTransfers(TEST_CHAIN_ID, receiptTokenAddress, 1)
      expect(transfers).toHaveLength(4)
    })
  })
})

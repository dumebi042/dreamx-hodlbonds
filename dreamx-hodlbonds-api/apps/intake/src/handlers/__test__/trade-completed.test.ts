/**
 * Tests for TradeCompleted event handler
 * Verifies trade insertion, balance updates, and metadata handling
 */

import { faker } from "@faker-js/faker"
import { getDb } from "@hodlbonds-api/db"
import { schema, bonds, trades } from "@hodlbonds-api/db/schema/index"
import { and, eq } from "drizzle-orm"
import { reset } from "drizzle-seed"
import { getAddress } from "viem"
import { beforeEach, describe, expect, it } from "vitest"

import {
  DEFAULT_TEST_CHAIN_ID,
  DEFAULT_TEST_PAIR_ID,
  insertTestBond,
  insertTestPair,
} from "@/test/helpers/bond-builders"
import { buildTradeCompletedEvent } from "@/test/helpers/event-builders"

import { handleTradeCompleted } from "../trade-completed"

const db = getDb()

describe("handleTradeCompleted", () => {
  const CHAIN_ID = DEFAULT_TEST_CHAIN_ID

  let testBond: Awaited<ReturnType<typeof insertTestBond>>
  let testPair: Awaited<ReturnType<typeof insertTestPair>>

  beforeEach(async () => {
    await reset(db, schema)

    // Insert test pair (required for bond FK)
    testPair = await insertTestPair()

    // Insert a complete bond for tests
    testBond = await insertTestBond({
      chainId: CHAIN_ID,
      vaultTokenAddress: testPair.vaultTokenAddress as `0x${string}`,
      stableTokenAddress: testPair.stableTokenAddress as `0x${string}`,
      pairId: DEFAULT_TEST_PAIR_ID,
      stableTokenBalance: 100n * 10n ** 18n, // 100 tokens
      vaultTokenBalance: 50n * 10n ** 18n, // 50 tokens
    })
  })

  describe("trade insertion", () => {
    it("inserts trade with correct data", async () => {
      const blockTimestamp = BigInt(Math.floor(Date.now() / 1000))
      const txHash = faker.string.hexadecimal({
        length: 64,
        prefix: "0x",
      }) as `0x${string}`

      const event = buildTradeCompletedEvent(
        {
          vaultAddress: testBond.vaultAddress,
          routerAddress: faker.finance.ethereumAddress() as `0x${string}`,
          tokenOut: testBond.stableTokenAddress,
          tokenIn: testBond.vaultTokenAddress,
          amountOut: 10n * 10n ** 18n, // 10 stable out
          amountIn: 5n * 10n ** 18n, // 5 vault in
          tokenInBalanceAfterSwap: 55n * 10n ** 18n, // vault: 50 + 5 = 55
          tokenOutBalanceAfterSwap: 90n * 10n ** 18n, // stable: 100 - 10 = 90
        },
        {
          chainId: CHAIN_ID,
          transactionHash: txHash,
          blockNumber: 12345678n,
          blockTimestamp,
          logIndex: 0,
        },
      )

      await handleTradeCompleted(event)

      const stored = await db
        .select()
        .from(trades)
        .where(and(eq(trades.chainId, CHAIN_ID), eq(trades.txHash, txHash)))

      expect(stored).toHaveLength(1)
      expect(stored[0]?.vaultAddress).toBe(testBond.vaultAddress)
      expect(stored[0]?.tokenOut).toBe(testBond.stableTokenAddress)
      expect(stored[0]?.tokenIn).toBe(testBond.vaultTokenAddress)
      expect(stored[0]?.amountOut).toBe(10n * 10n ** 18n)
      expect(stored[0]?.amountIn).toBe(5n * 10n ** 18n)
      expect(stored[0]?.tokenInBalance).toBe(55n * 10n ** 18n)
      expect(stored[0]?.tokenOutBalance).toBe(90n * 10n ** 18n)
      expect(stored[0]?.blockNumber).toBe(12345678)
      expect(stored[0]?.blockTimestamp).toEqual(new Date(Number(blockTimestamp) * 1000))
      expect(stored[0]?.logIndex).toBe(0)
    })

    it("checksums addresses in trade", async () => {
      const lowercaseRouter = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      const event = buildTradeCompletedEvent(
        {
          vaultAddress: testBond.vaultAddress.toLowerCase() as `0x${string}`,
          routerAddress: lowercaseRouter as `0x${string}`,
          tokenOut: testBond.stableTokenAddress.toLowerCase() as `0x${string}`,
          tokenIn: testBond.vaultTokenAddress.toLowerCase() as `0x${string}`,
          amountOut: 10n * 10n ** 18n,
          amountIn: 5n * 10n ** 18n,
          tokenInBalanceAfterSwap: 55n * 10n ** 18n,
          tokenOutBalanceAfterSwap: 90n * 10n ** 18n,
        },
        {
          chainId: CHAIN_ID,
          blockNumber: BigInt(testBond.balanceBlockNumber! + 1000),
        },
      )

      await handleTradeCompleted(event)

      const stored = await db.select().from(trades).where(eq(trades.chainId, CHAIN_ID))

      expect(stored).toHaveLength(1)
      expect(stored[0]?.vaultAddress).toBe(getAddress(testBond.vaultAddress))
      expect(stored[0]?.routerAddress).toBe(getAddress(lowercaseRouter))
      expect(stored[0]?.tokenOut).toBe(getAddress(testBond.stableTokenAddress))
      expect(stored[0]?.tokenIn).toBe(getAddress(testBond.vaultTokenAddress))
    })
  })

  describe("balance updates", () => {
    it("updates balances when selling stable for vault tokens", async () => {
      const event = buildTradeCompletedEvent(
        {
          vaultAddress: testBond.vaultAddress,
          routerAddress: faker.finance.ethereumAddress() as `0x${string}`,
          tokenIn: testBond.vaultTokenAddress, // Buy vault
          tokenOut: testBond.stableTokenAddress, // Sell stable
          amountIn: 5n * 10n ** 18n, // 5 vault in
          amountOut: 10n * 10n ** 18n, // 10 stable out
          tokenInBalanceAfterSwap: 55n * 10n ** 18n, // vault after: 55
          tokenOutBalanceAfterSwap: 90n * 10n ** 18n, // stable after: 90
        },
        {
          chainId: CHAIN_ID,
          blockNumber: BigInt(testBond.balanceBlockNumber! + 1000),
        },
      )

      await handleTradeCompleted(event)

      const updated = await db
        .select()
        .from(bonds)
        .where(and(eq(bonds.chainId, CHAIN_ID), eq(bonds.vaultAddress, testBond.vaultAddress)))

      expect(updated).toHaveLength(1)
      // Balances should match the post-swap values from the event
      expect(updated[0]?.vaultTokenBalance).toBe(55n * 10n ** 18n)
      expect(updated[0]?.stableTokenBalance).toBe(90n * 10n ** 18n)
    })

    it("updates balances when selling vault for stable tokens", async () => {
      const event = buildTradeCompletedEvent(
        {
          vaultAddress: testBond.vaultAddress,
          routerAddress: faker.finance.ethereumAddress() as `0x${string}`,
          tokenIn: testBond.stableTokenAddress, // Buy stable
          tokenOut: testBond.vaultTokenAddress, // Sell vault
          amountIn: 25n * 10n ** 18n, // 25 stable in
          amountOut: 20n * 10n ** 18n, // 20 vault out
          tokenInBalanceAfterSwap: 125n * 10n ** 18n, // stable after: 125
          tokenOutBalanceAfterSwap: 30n * 10n ** 18n, // vault after: 30
        },
        {
          chainId: CHAIN_ID,
          blockNumber: BigInt(testBond.balanceBlockNumber! + 1000),
        },
      )

      await handleTradeCompleted(event)

      const updated = await db
        .select()
        .from(bonds)
        .where(and(eq(bonds.chainId, CHAIN_ID), eq(bonds.vaultAddress, testBond.vaultAddress)))

      expect(updated).toHaveLength(1)
      // Balances should match the post-swap values from the event
      expect(updated[0]?.stableTokenBalance).toBe(125n * 10n ** 18n)
      expect(updated[0]?.vaultTokenBalance).toBe(30n * 10n ** 18n)
    })
  })

  describe("metadata updates", () => {
    it("updates lastSwap metadata for first trade", async () => {
      const blockTimestamp = BigInt(Math.floor(Date.now() / 1000))
      const event = buildTradeCompletedEvent(
        {
          vaultAddress: testBond.vaultAddress as `0x${string}`,
          routerAddress: faker.finance.ethereumAddress() as `0x${string}`,
          tokenIn: testBond.vaultTokenAddress as `0x${string}`,
          tokenOut: testBond.stableTokenAddress as `0x${string}`,
          amountIn: 5n * 10n ** 18n,
          amountOut: 10n * 10n ** 18n,
          tokenInBalanceAfterSwap: 55n * 10n ** 18n,
          tokenOutBalanceAfterSwap: 90n * 10n ** 18n,
        },
        {
          chainId: CHAIN_ID,
          blockNumber: 99999999n,
          blockTimestamp,
        },
      )

      await handleTradeCompleted(event)

      const updated = await db
        .select()
        .from(bonds)
        .where(and(eq(bonds.chainId, CHAIN_ID), eq(bonds.vaultAddress, testBond.vaultAddress)))

      expect(updated).toHaveLength(1)
      expect(updated[0]?.lastSwapBlockNumber).toBe(99999999)
      expect(updated[0]?.lastSwapBlockTimestamp).toEqual(new Date(Number(blockTimestamp) * 1000))
      expect(updated[0]?.balanceBlockNumber).toBe(99999999)
      expect(updated[0]?.balanceBlockTimestamp).toEqual(new Date(Number(blockTimestamp) * 1000))
    })

    it("updates lastSwap metadata when trade is newer", async () => {
      const newerBlockTimestamp = BigInt(Math.floor(Date.now() / 1000))
      const newerBlockNumber = testBond.balanceBlockNumber! + 1000

      const event = buildTradeCompletedEvent(
        {
          vaultAddress: testBond.vaultAddress,
          routerAddress: faker.finance.ethereumAddress() as `0x${string}`,
          tokenIn: testBond.vaultTokenAddress,
          tokenOut: testBond.stableTokenAddress,
          amountIn: 5n * 10n ** 18n,
          amountOut: 10n * 10n ** 18n,
          tokenInBalanceAfterSwap: 55n * 10n ** 18n,
          tokenOutBalanceAfterSwap: 90n * 10n ** 18n,
        },
        {
          chainId: CHAIN_ID,
          blockNumber: BigInt(newerBlockNumber),
          blockTimestamp: newerBlockTimestamp,
        },
      )

      await handleTradeCompleted(event)

      const updated = await db
        .select()
        .from(bonds)
        .where(and(eq(bonds.chainId, CHAIN_ID), eq(bonds.vaultAddress, testBond.vaultAddress)))

      expect(updated).toHaveLength(1)
      expect(updated[0]?.lastSwapBlockNumber).toBe(newerBlockNumber)
      expect(updated[0]?.balanceBlockNumber).toBe(newerBlockNumber)
    })

    it("does NOT update lastSwap metadata when trade is older", async () => {
      // First, insert a newer trade
      const newerBlockNumber = testBond.balanceBlockNumber! + 1000
      const newerBlockTimestamp = BigInt(Math.floor(Date.now() / 1000))

      await db
        .update(bonds)
        .set({
          lastSwapBlockNumber: newerBlockNumber,
          lastSwapBlockTimestamp: new Date(Number(newerBlockTimestamp) * 1000),
          balanceBlockNumber: newerBlockNumber,
          balanceBlockTimestamp: new Date(Number(newerBlockTimestamp) * 1000),
        })
        .where(and(eq(bonds.chainId, CHAIN_ID), eq(bonds.vaultAddress, testBond.vaultAddress)))

      // Now process an older trade
      const olderBlockNumber = testBond.balanceBlockNumber! - 100
      const olderBlockTimestamp = BigInt(Math.floor((Date.now() - 1000 * 60 * 60) / 1000)) // 1 hour ago

      const event = buildTradeCompletedEvent(
        {
          vaultAddress: testBond.vaultAddress,
          routerAddress: faker.finance.ethereumAddress() as `0x${string}`,
          tokenIn: testBond.vaultTokenAddress,
          tokenOut: testBond.stableTokenAddress,
          amountIn: 5n * 10n ** 18n,
          amountOut: 10n * 10n ** 18n,
          tokenInBalanceAfterSwap: 55n * 10n ** 18n,
          tokenOutBalanceAfterSwap: 90n * 10n ** 18n,
        },
        {
          chainId: CHAIN_ID,
          blockNumber: BigInt(olderBlockNumber),
          blockTimestamp: olderBlockTimestamp,
        },
      )

      await handleTradeCompleted(event)

      const updated = await db
        .select()
        .from(bonds)
        .where(and(eq(bonds.chainId, CHAIN_ID), eq(bonds.vaultAddress, testBond.vaultAddress)))

      expect(updated).toHaveLength(1)
      // Metadata should NOT be updated (kept newer values)
      expect(updated[0]?.lastSwapBlockNumber).toBe(newerBlockNumber)
      expect(updated[0]?.lastSwapBlockTimestamp).toEqual(
        new Date(Number(newerBlockTimestamp) * 1000),
      )
      expect(updated[0]?.balanceBlockNumber).toBe(newerBlockNumber)
      expect(updated[0]?.balanceBlockTimestamp).toEqual(
        new Date(Number(newerBlockTimestamp) * 1000),
      )
      // Balances should also NOT be updated (older event ignored)
      expect(updated[0]?.stableTokenBalance).toBe(testBond.stableTokenBalance)
      expect(updated[0]?.vaultTokenBalance).toBe(testBond.vaultTokenBalance)
    })

    it("updates balance metadata independently of lastSwap metadata", async () => {
      // Simulate: lastSwap is older, but balance was updated by BondIssued more recently
      const lastSwapBlock = testBond.balanceBlockNumber! - 500
      const balanceBlock = testBond.balanceBlockNumber! + 100

      await db
        .update(bonds)
        .set({
          lastSwapBlockNumber: lastSwapBlock,
          lastSwapBlockTimestamp: new Date(
            Number(BigInt(Math.floor((Date.now() - 2000 * 60 * 60) / 1000))) * 1000,
          ),
          balanceBlockNumber: balanceBlock,
          balanceBlockTimestamp: new Date(
            Number(BigInt(Math.floor((Date.now() - 1000 * 60 * 60) / 1000))) * 1000,
          ),
        })
        .where(and(eq(bonds.chainId, CHAIN_ID), eq(bonds.vaultAddress, testBond.vaultAddress)))

      // New trade is newer than lastSwap but older than balance update
      const newTradeBlock = lastSwapBlock + 200 // Newer than lastSwap, older than balance
      const newTradeTimestamp = BigInt(Math.floor((Date.now() - 1500 * 60 * 60) / 1000))

      const event = buildTradeCompletedEvent(
        {
          vaultAddress: testBond.vaultAddress,
          routerAddress: faker.finance.ethereumAddress() as `0x${string}`,
          tokenIn: testBond.vaultTokenAddress,
          tokenOut: testBond.stableTokenAddress,
          amountIn: 5n * 10n ** 18n,
          amountOut: 10n * 10n ** 18n,
          tokenInBalanceAfterSwap: 55n * 10n ** 18n,
          tokenOutBalanceAfterSwap: 90n * 10n ** 18n,
        },
        {
          chainId: CHAIN_ID,
          blockNumber: BigInt(newTradeBlock),
          blockTimestamp: newTradeTimestamp,
        },
      )

      await handleTradeCompleted(event)

      const updated = await db
        .select()
        .from(bonds)
        .where(and(eq(bonds.chainId, CHAIN_ID), eq(bonds.vaultAddress, testBond.vaultAddress)))

      expect(updated).toHaveLength(1)
      // lastSwap should be updated (newer than previous lastSwap)
      expect(updated[0]?.lastSwapBlockNumber).toBe(newTradeBlock)
      expect(updated[0]?.lastSwapBlockTimestamp).toEqual(new Date(Number(newTradeTimestamp) * 1000))
      // balance metadata should NOT be updated (older than current balance update)
      expect(updated[0]?.balanceBlockNumber).toBe(balanceBlock)
    })
  })

  describe("error handling", () => {
    it("throws when bond not found", async () => {
      const nonexistentVault = faker.finance.ethereumAddress() as `0x${string}`

      const event = buildTradeCompletedEvent(
        {
          vaultAddress: nonexistentVault,
          routerAddress: faker.finance.ethereumAddress() as `0x${string}`,
          tokenIn: testBond.vaultTokenAddress,
          tokenOut: testBond.stableTokenAddress,
          amountIn: 5n * 10n ** 18n,
          amountOut: 10n * 10n ** 18n,
          tokenInBalanceAfterSwap: 55n * 10n ** 18n,
          tokenOutBalanceAfterSwap: 90n * 10n ** 18n,
        },
        {
          chainId: CHAIN_ID,
          blockNumber: BigInt(testBond.balanceBlockNumber! + 1000),
        },
      )

      await expect(handleTradeCompleted(event)).rejects.toThrow(
        `Bond not found for vault ${nonexistentVault} on chain ${CHAIN_ID}`,
      )

      // No trade should be inserted
      const storedTrades = await db.select().from(trades)
      expect(storedTrades).toHaveLength(0)
    })

    it("throws when blockTimestamp is missing", async () => {
      const event = buildTradeCompletedEvent(
        {
          vaultAddress: testBond.vaultAddress,
          routerAddress: faker.finance.ethereumAddress() as `0x${string}`,
          tokenIn: testBond.vaultTokenAddress,
          tokenOut: testBond.stableTokenAddress,
          amountIn: 5n * 10n ** 18n,
          amountOut: 10n * 10n ** 18n,
          tokenInBalanceAfterSwap: 55n * 10n ** 18n,
          tokenOutBalanceAfterSwap: 90n * 10n ** 18n,
        },
        {
          chainId: CHAIN_ID,
          transactionHash: "0xdeadbeef00000000000000000000000000000000000000000000000000000000",
        },
      )

      // Explicitly remove blockTimestamp
      event.blockTimestamp = undefined

      await expect(handleTradeCompleted(event)).rejects.toThrow(
        "Missing required event metadata for TradeCompleted event",
      )
    })

    it("throws when tokenOut doesn't match either bond token", async () => {
      const randomToken = faker.finance.ethereumAddress() as `0x${string}`

      const event = buildTradeCompletedEvent(
        {
          vaultAddress: testBond.vaultAddress,
          routerAddress: faker.finance.ethereumAddress() as `0x${string}`,
          tokenIn: testBond.vaultTokenAddress,
          tokenOut: randomToken, // Wrong token
          amountIn: 5n * 10n ** 18n,
          amountOut: 10n * 10n ** 18n,
          tokenInBalanceAfterSwap: 55n * 10n ** 18n,
          tokenOutBalanceAfterSwap: 90n * 10n ** 18n,
        },
        {
          chainId: CHAIN_ID,
          blockNumber: BigInt(testBond.balanceBlockNumber! + 1000),
        },
      )

      await expect(handleTradeCompleted(event)).rejects.toThrow("Invalid token combination")
    })

    it("throws when tokenIn doesn't match either bond token", async () => {
      const randomToken = faker.finance.ethereumAddress() as `0x${string}`

      const event = buildTradeCompletedEvent(
        {
          vaultAddress: testBond.vaultAddress,
          routerAddress: faker.finance.ethereumAddress() as `0x${string}`,
          tokenIn: randomToken, // Wrong token
          tokenOut: testBond.stableTokenAddress,
          amountIn: 5n * 10n ** 18n,
          amountOut: 10n * 10n ** 18n,
          tokenInBalanceAfterSwap: 55n * 10n ** 18n,
          tokenOutBalanceAfterSwap: 90n * 10n ** 18n,
        },
        {
          chainId: CHAIN_ID,
          blockNumber: BigInt(testBond.balanceBlockNumber! + 1000),
        },
      )

      await expect(handleTradeCompleted(event)).rejects.toThrow("Invalid token combination")
    })
  })

  describe("duplicate prevention", () => {
    it("prevents duplicate trade insertion and rolls back balance update", async () => {
      const txHash = faker.string.hexadecimal({
        length: 64,
        prefix: "0x",
      }) as `0x${string}`
      const blockTimestamp = BigInt(Math.floor(Date.now() / 1000))

      const event = buildTradeCompletedEvent(
        {
          vaultAddress: testBond.vaultAddress,
          routerAddress: faker.finance.ethereumAddress() as `0x${string}`,
          tokenIn: testBond.vaultTokenAddress,
          tokenOut: testBond.stableTokenAddress,
          amountIn: 5n * 10n ** 18n,
          amountOut: 10n * 10n ** 18n,
          tokenInBalanceAfterSwap: 55n * 10n ** 18n,
          tokenOutBalanceAfterSwap: 90n * 10n ** 18n,
        },
        {
          chainId: CHAIN_ID,
          transactionHash: txHash,
          blockNumber: BigInt(testBond.balanceBlockNumber! + 1000),
          blockTimestamp,
          logIndex: 0,
        },
      )

      // First insertion should succeed
      await handleTradeCompleted(event)

      const firstBond = await db
        .select()
        .from(bonds)
        .where(and(eq(bonds.chainId, CHAIN_ID), eq(bonds.vaultAddress, testBond.vaultAddress)))
      const firstTrades = await db.select().from(trades)

      expect(firstTrades).toHaveLength(1)
      expect(firstBond[0]?.stableTokenBalance).toBe(90n * 10n ** 18n)
      expect(firstBond[0]?.vaultTokenBalance).toBe(55n * 10n ** 18n)

      // Second insertion (duplicate) should fail with constraint violation
      await expect(handleTradeCompleted(event)).rejects.toThrow(/Failed query/)

      // Bond balance should remain unchanged (rollback)
      const secondBond = await db
        .select()
        .from(bonds)
        .where(and(eq(bonds.chainId, CHAIN_ID), eq(bonds.vaultAddress, testBond.vaultAddress)))
      const secondTrades = await db.select().from(trades)

      expect(secondTrades).toHaveLength(1) // Still only 1 trade
      expect(secondBond[0]?.stableTokenBalance).toBe(90n * 10n ** 18n) // Unchanged
      expect(secondBond[0]?.vaultTokenBalance).toBe(55n * 10n ** 18n) // Unchanged
    })
  })

  describe("out-of-order event processing", () => {
    it("uses newest block's balances regardless of arrival order", async () => {
      // Update bond to have known initial state with low block numbers
      await db
        .update(bonds)
        .set({
          balanceBlockNumber: 500,
          balanceBlockTimestamp: new Date(500 * 1000),
          lastSwapBlockNumber: null,
          lastSwapBlockTimestamp: null,
        })
        .where(and(eq(bonds.chainId, CHAIN_ID), eq(bonds.vaultAddress, testBond.vaultAddress)))

      // Trade A (block 1000): reports balances 90 stable, 55 vault
      const tradeA = buildTradeCompletedEvent(
        {
          vaultAddress: testBond.vaultAddress,
          routerAddress: faker.finance.ethereumAddress() as `0x${string}`,
          tokenIn: testBond.vaultTokenAddress,
          tokenOut: testBond.stableTokenAddress,
          amountIn: 5n * 10n ** 18n,
          amountOut: 10n * 10n ** 18n,
          tokenInBalanceAfterSwap: 55n * 10n ** 18n,
          tokenOutBalanceAfterSwap: 90n * 10n ** 18n,
        },
        {
          chainId: CHAIN_ID,
          blockNumber: 1000n,
          blockTimestamp: BigInt(1000),
          logIndex: 0,
        },
      )

      // Trade B (block 999): reports balances 80 stable, 58 vault
      const tradeB = buildTradeCompletedEvent(
        {
          vaultAddress: testBond.vaultAddress,
          routerAddress: faker.finance.ethereumAddress() as `0x${string}`,
          tokenIn: testBond.vaultTokenAddress,
          tokenOut: testBond.stableTokenAddress,
          amountIn: 8n * 10n ** 18n,
          amountOut: 20n * 10n ** 18n,
          tokenInBalanceAfterSwap: 58n * 10n ** 18n,
          tokenOutBalanceAfterSwap: 80n * 10n ** 18n,
        },
        {
          chainId: CHAIN_ID,
          blockNumber: 999n,
          blockTimestamp: BigInt(999),
          logIndex: 0,
        },
      )

      // Process in wrong order: A happens first, then B arrives late
      await handleTradeCompleted(tradeA) // Block 1000 arrives first
      await handleTradeCompleted(tradeB) // Block 999 arrives second (out of order)

      const updated = await db
        .select()
        .from(bonds)
        .where(and(eq(bonds.chainId, CHAIN_ID), eq(bonds.vaultAddress, testBond.vaultAddress)))

      expect(updated).toHaveLength(1)
      // With absolute balances, newer block wins: balances from block 1000
      expect(updated[0]?.stableTokenBalance).toBe(90n * 10n ** 18n)
      expect(updated[0]?.vaultTokenBalance).toBe(55n * 10n ** 18n)
      // Metadata should reflect newer trade (block 1000)
      expect(updated[0]?.lastSwapBlockNumber).toBe(1000)
      expect(updated[0]?.balanceBlockNumber).toBe(1000)
    })
  })

  describe("native token handling", () => {
    it("matches wrapped native address when vault token is 0x0", async () => {
      // Create a bond with native token (0x0) as vault token
      const nativeBond = await insertTestBond({
        chainId: CHAIN_ID,
        vaultTokenAddress: "0x0000000000000000000000000000000000000000",
        stableTokenAddress: testPair.stableTokenAddress as `0x${string}`,
        pairId: DEFAULT_TEST_PAIR_ID,
        stableTokenBalance: 100n * 10n ** 18n,
        vaultTokenBalance: 50n * 10n ** 18n,
      })

      // Event uses wrapped native address (WETH/WAVAX) instead of 0x0
      const event = buildTradeCompletedEvent(
        {
          vaultAddress: nativeBond.vaultAddress,
          routerAddress: faker.finance.ethereumAddress() as `0x${string}`,
          tokenIn: testPair.wrappedNativeTokenAddress as `0x${string}`, // Uses WETH, not 0x0
          tokenOut: nativeBond.stableTokenAddress,
          amountIn: 5n * 10n ** 18n,
          amountOut: 10n * 10n ** 18n,
          tokenInBalanceAfterSwap: 55n * 10n ** 18n, // vault after
          tokenOutBalanceAfterSwap: 90n * 10n ** 18n, // stable after
        },
        {
          chainId: CHAIN_ID,
          blockNumber: BigInt(nativeBond.balanceBlockNumber! + 1000),
        },
      )

      await handleTradeCompleted(event)

      // Verify trade was inserted
      const storedTrades = await db
        .select()
        .from(trades)
        .where(eq(trades.vaultAddress, nativeBond.vaultAddress))

      expect(storedTrades).toHaveLength(1)
      expect(storedTrades[0]?.tokenIn).toBe(testPair.wrappedNativeTokenAddress)

      // Verify balances were updated correctly
      const updatedBond = await db
        .select()
        .from(bonds)
        .where(and(eq(bonds.chainId, CHAIN_ID), eq(bonds.vaultAddress, nativeBond.vaultAddress)))

      expect(updatedBond).toHaveLength(1)
      expect(updatedBond[0]?.vaultTokenBalance).toBe(55n * 10n ** 18n)
      expect(updatedBond[0]?.stableTokenBalance).toBe(90n * 10n ** 18n)
    })

    it("handles reverse trade direction with native token", async () => {
      // Create a bond with native token (0x0) as vault token
      const nativeBond = await insertTestBond({
        chainId: CHAIN_ID,
        vaultTokenAddress: "0x0000000000000000000000000000000000000000",
        stableTokenAddress: testPair.stableTokenAddress as `0x${string}`,
        pairId: DEFAULT_TEST_PAIR_ID,
        stableTokenBalance: 100n * 10n ** 18n,
        vaultTokenBalance: 50n * 10n ** 18n,
      })

      // Sell stable to buy wrapped native (vault token)
      const event = buildTradeCompletedEvent(
        {
          vaultAddress: nativeBond.vaultAddress,
          routerAddress: faker.finance.ethereumAddress() as `0x${string}`,
          tokenIn: nativeBond.stableTokenAddress, // Sell stable
          tokenOut: testPair.wrappedNativeTokenAddress as `0x${string}`, // Buy WETH (vault)
          amountIn: 10n * 10n ** 18n,
          amountOut: 5n * 10n ** 18n,
          tokenInBalanceAfterSwap: 110n * 10n ** 18n, // stable after
          tokenOutBalanceAfterSwap: 45n * 10n ** 18n, // vault after
        },
        {
          chainId: CHAIN_ID,
          blockNumber: BigInt(nativeBond.balanceBlockNumber! + 1000),
        },
      )

      await handleTradeCompleted(event)

      const updatedBond = await db
        .select()
        .from(bonds)
        .where(and(eq(bonds.chainId, CHAIN_ID), eq(bonds.vaultAddress, nativeBond.vaultAddress)))

      expect(updatedBond).toHaveLength(1)
      expect(updatedBond[0]?.stableTokenBalance).toBe(110n * 10n ** 18n)
      expect(updatedBond[0]?.vaultTokenBalance).toBe(45n * 10n ** 18n)
    })

    it("throws error when wrapped native address doesn't match and vault token is 0x0", async () => {
      const nativeBond = await insertTestBond({
        chainId: CHAIN_ID,
        vaultTokenAddress: "0x0000000000000000000000000000000000000000",
        stableTokenAddress: testPair.stableTokenAddress as `0x${string}`,
        pairId: DEFAULT_TEST_PAIR_ID,
      })

      // Use a wrong wrapped token address
      const wrongAddress = faker.finance.ethereumAddress() as `0x${string}`
      const event = buildTradeCompletedEvent(
        {
          vaultAddress: nativeBond.vaultAddress,
          routerAddress: faker.finance.ethereumAddress() as `0x${string}`,
          tokenIn: wrongAddress, // Wrong address
          tokenOut: nativeBond.stableTokenAddress,
          amountIn: 5n * 10n ** 18n,
          amountOut: 10n * 10n ** 18n,
          tokenInBalanceAfterSwap: 55n * 10n ** 18n,
          tokenOutBalanceAfterSwap: 90n * 10n ** 18n,
        },
        {
          chainId: CHAIN_ID,
          blockNumber: BigInt(nativeBond.balanceBlockNumber! + 1000),
        },
      )

      await expect(handleTradeCompleted(event)).rejects.toThrow(/Invalid token combination/)
    })

    it("still works with regular ERC20 vault tokens", async () => {
      // Regular bond with ERC20 vault token (not 0x0)
      const event = buildTradeCompletedEvent(
        {
          vaultAddress: testBond.vaultAddress,
          routerAddress: faker.finance.ethereumAddress() as `0x${string}`,
          tokenIn: testBond.vaultTokenAddress, // Regular ERC20
          tokenOut: testBond.stableTokenAddress,
          amountIn: 5n * 10n ** 18n,
          amountOut: 10n * 10n ** 18n,
          tokenInBalanceAfterSwap: 55n * 10n ** 18n,
          tokenOutBalanceAfterSwap: 90n * 10n ** 18n,
        },
        {
          chainId: CHAIN_ID,
          blockNumber: BigInt(testBond.balanceBlockNumber! + 1000),
        },
      )

      await handleTradeCompleted(event)

      const updatedBond = await db
        .select()
        .from(bonds)
        .where(and(eq(bonds.chainId, CHAIN_ID), eq(bonds.vaultAddress, testBond.vaultAddress)))

      expect(updatedBond).toHaveLength(1)
      expect(updatedBond[0]?.vaultTokenBalance).toBe(55n * 10n ** 18n)
      expect(updatedBond[0]?.stableTokenBalance).toBe(90n * 10n ** 18n)
    })
  })
})

/**
 * Tests for BondRedeemed event handler
 * Verifies correct settlement state updates for bond redemption
 */

import { getDb } from "@hodlbonds-api/db"
import { bonds, schema } from "@hodlbonds-api/db/schema/index"
import { and, eq } from "drizzle-orm"
import { reset } from "drizzle-seed"
import { getAddress } from "viem"
import { beforeEach, describe, expect, it } from "vitest"

import { insertTestBond, insertTestPair } from "@/test/helpers/bond-builders"
import { buildBondRedeemedEvent } from "@/test/helpers/event-builders"

import { handleBondRedeemed } from "../bond-redeemed"

const db = getDb()

describe("handleBondRedeemed", () => {
  const CHAIN_ID = 43114
  const VAULT_ADDRESS = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as `0x${string}`
  const VAULT_TOKEN_ADDRESS = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as `0x${string}`
  const STABLE_TOKEN_ADDRESS = "0xcccccccccccccccccccccccccccccccccccccccc" as `0x${string}`
  const REDEEMER_ADDRESS = "0xdddddddddddddddddddddddddddddddddddddddd" as `0x${string}`

  const BLOCK_NUMBER = 12345678n
  const BLOCK_TIMESTAMP = BigInt(Math.floor(Date.now() / 1000))
  const TX_HASH =
    "0x1234567890123456789012345678901234567890123456789012345678901234" as `0x${string}`

  beforeEach(async () => {
    await reset(db, schema)
  })

  describe("successful redemption", () => {
    it("updates vault state to SETTLED (2)", async () => {
      await insertTestPair()
      await insertTestBond({
        chainId: CHAIN_ID,
        vaultAddress: getAddress(VAULT_ADDRESS),
        vaultTokenAddress: getAddress(VAULT_TOKEN_ADDRESS),
        stableTokenAddress: getAddress(STABLE_TOKEN_ADDRESS),
      })

      const event = buildBondRedeemedEvent(
        {
          redeemer: REDEEMER_ADDRESS,
          vaultToken: VAULT_TOKEN_ADDRESS,
          stableToken: STABLE_TOKEN_ADDRESS,
          vaultTokenAmount: 500000000000000000n,
          stableTokenAmount: 1500000000000000000n,
          performanceFeeAmount: 50000000000000000n,
        },
        {
          address: VAULT_ADDRESS,
          chainId: CHAIN_ID,
          blockNumber: BLOCK_NUMBER,
          blockTimestamp: BLOCK_TIMESTAMP,
          transactionHash: TX_HASH,
          logIndex: 0,
        },
      )

      await handleBondRedeemed(event)

      const stored = await db
        .select()
        .from(bonds)
        .where(and(eq(bonds.chainId, CHAIN_ID), eq(bonds.vaultAddress, getAddress(VAULT_ADDRESS))))

      expect(stored).toHaveLength(1)
      expect(stored[0]?.vaultState).toBe(2)
    })

    it("sets current balances to zero", async () => {
      await insertTestPair()
      await insertTestBond({
        chainId: CHAIN_ID,
        vaultAddress: getAddress(VAULT_ADDRESS),
        vaultTokenAddress: getAddress(VAULT_TOKEN_ADDRESS),
        stableTokenAddress: getAddress(STABLE_TOKEN_ADDRESS),
        stableTokenBalance: 1000000000000000000n,
        vaultTokenBalance: 2000000000000000000n,
      })

      const event = buildBondRedeemedEvent(
        {
          redeemer: REDEEMER_ADDRESS,
          vaultToken: VAULT_TOKEN_ADDRESS,
          stableToken: STABLE_TOKEN_ADDRESS,
          vaultTokenAmount: 500000000000000000n,
          stableTokenAmount: 1500000000000000000n,
          performanceFeeAmount: 50000000000000000n,
        },
        {
          address: VAULT_ADDRESS,
          chainId: CHAIN_ID,
          blockNumber: BLOCK_NUMBER,
          blockTimestamp: BLOCK_TIMESTAMP,
          transactionHash: TX_HASH,
          logIndex: 0,
        },
      )

      await handleBondRedeemed(event)

      const stored = await db
        .select()
        .from(bonds)
        .where(and(eq(bonds.chainId, CHAIN_ID), eq(bonds.vaultAddress, getAddress(VAULT_ADDRESS))))

      expect(stored[0]?.stableTokenBalance).toBe(0n)
      expect(stored[0]?.vaultTokenBalance).toBe(0n)
      expect(stored[0]?.balanceBlockNumber).toBe(Number(BLOCK_NUMBER))
      expect(stored[0]?.balanceBlockTimestamp).toEqual(new Date(Number(BLOCK_TIMESTAMP) * 1000))
    })

    it("records final balances from event data", async () => {
      await insertTestPair()
      await insertTestBond({
        chainId: CHAIN_ID,
        vaultAddress: getAddress(VAULT_ADDRESS),
        vaultTokenAddress: getAddress(VAULT_TOKEN_ADDRESS),
        stableTokenAddress: getAddress(STABLE_TOKEN_ADDRESS),
      })

      const finalVaultAmount = 500000000000000000n
      const finalStableAmount = 1500000000000000000n

      const event = buildBondRedeemedEvent(
        {
          redeemer: REDEEMER_ADDRESS,
          vaultToken: VAULT_TOKEN_ADDRESS,
          stableToken: STABLE_TOKEN_ADDRESS,
          vaultTokenAmount: finalVaultAmount,
          stableTokenAmount: finalStableAmount,
          performanceFeeAmount: 50000000000000000n,
        },
        {
          address: VAULT_ADDRESS,
          chainId: CHAIN_ID,
          blockNumber: BLOCK_NUMBER,
          blockTimestamp: BLOCK_TIMESTAMP,
          transactionHash: TX_HASH,
          logIndex: 0,
        },
      )

      await handleBondRedeemed(event)

      const stored = await db
        .select()
        .from(bonds)
        .where(and(eq(bonds.chainId, CHAIN_ID), eq(bonds.vaultAddress, getAddress(VAULT_ADDRESS))))

      expect(stored[0]?.finalVaultTokenBalance).toBe(finalVaultAmount)
      expect(stored[0]?.finalStableTokenBalance).toBe(finalStableAmount)
    })

    it("records settlement details", async () => {
      await insertTestPair()
      await insertTestBond({
        chainId: CHAIN_ID,
        vaultAddress: getAddress(VAULT_ADDRESS),
        vaultTokenAddress: getAddress(VAULT_TOKEN_ADDRESS),
        stableTokenAddress: getAddress(STABLE_TOKEN_ADDRESS),
      })

      const event = buildBondRedeemedEvent(
        {
          redeemer: REDEEMER_ADDRESS,
          vaultToken: VAULT_TOKEN_ADDRESS,
          stableToken: STABLE_TOKEN_ADDRESS,
          vaultTokenAmount: 500000000000000000n,
          stableTokenAmount: 1500000000000000000n,
          performanceFeeAmount: 50000000000000000n,
        },
        {
          address: VAULT_ADDRESS,
          chainId: CHAIN_ID,
          blockNumber: BLOCK_NUMBER,
          blockTimestamp: BLOCK_TIMESTAMP,
          transactionHash: TX_HASH,
          logIndex: 0,
        },
      )

      await handleBondRedeemed(event)

      const stored = await db
        .select()
        .from(bonds)
        .where(and(eq(bonds.chainId, CHAIN_ID), eq(bonds.vaultAddress, getAddress(VAULT_ADDRESS))))

      expect(stored[0]?.settledBlockNumber).toBe(Number(BLOCK_NUMBER))
      expect(stored[0]?.settledBlockTimestamp).toEqual(new Date(Number(BLOCK_TIMESTAMP) * 1000))
      expect(stored[0]?.settledBy).toBe(getAddress(REDEEMER_ADDRESS))
    })

    it("records performance fee paid", async () => {
      await insertTestPair()
      await insertTestBond({
        chainId: CHAIN_ID,
        vaultAddress: getAddress(VAULT_ADDRESS),
        vaultTokenAddress: getAddress(VAULT_TOKEN_ADDRESS),
        stableTokenAddress: getAddress(STABLE_TOKEN_ADDRESS),
      })

      const performanceFee = 75000000000000000n

      const event = buildBondRedeemedEvent(
        {
          redeemer: REDEEMER_ADDRESS,
          vaultToken: VAULT_TOKEN_ADDRESS,
          stableToken: STABLE_TOKEN_ADDRESS,
          vaultTokenAmount: 500000000000000000n,
          stableTokenAmount: 1500000000000000000n,
          performanceFeeAmount: performanceFee,
        },
        {
          address: VAULT_ADDRESS,
          chainId: CHAIN_ID,
          blockNumber: BLOCK_NUMBER,
          blockTimestamp: BLOCK_TIMESTAMP,
          transactionHash: TX_HASH,
          logIndex: 0,
        },
      )

      await handleBondRedeemed(event)

      const stored = await db
        .select()
        .from(bonds)
        .where(and(eq(bonds.chainId, CHAIN_ID), eq(bonds.vaultAddress, getAddress(VAULT_ADDRESS))))

      expect(stored[0]?.performanceFeePaid).toBe(performanceFee)
    })

    it("checksums the redeemer address", async () => {
      await insertTestPair()
      await insertTestBond({
        chainId: CHAIN_ID,
        vaultAddress: getAddress(VAULT_ADDRESS),
        vaultTokenAddress: getAddress(VAULT_TOKEN_ADDRESS),
        stableTokenAddress: getAddress(STABLE_TOKEN_ADDRESS),
      })

      const lowercaseRedeemer = "0xdddddddddddddddddddddddddddddddddddddddd" as `0x${string}`

      const event = buildBondRedeemedEvent(
        {
          redeemer: lowercaseRedeemer,
          vaultToken: VAULT_TOKEN_ADDRESS,
          stableToken: STABLE_TOKEN_ADDRESS,
          vaultTokenAmount: 500000000000000000n,
          stableTokenAmount: 1500000000000000000n,
          performanceFeeAmount: 50000000000000000n,
        },
        {
          address: VAULT_ADDRESS,
          chainId: CHAIN_ID,
          blockNumber: BLOCK_NUMBER,
          blockTimestamp: BLOCK_TIMESTAMP,
          transactionHash: TX_HASH,
          logIndex: 0,
        },
      )

      await handleBondRedeemed(event)

      const stored = await db
        .select()
        .from(bonds)
        .where(and(eq(bonds.chainId, CHAIN_ID), eq(bonds.vaultAddress, getAddress(VAULT_ADDRESS))))

      expect(stored[0]?.settledBy).toBe(getAddress(lowercaseRedeemer))
    })
  })

  describe("idempotency", () => {
    it("is idempotent - processing same event twice produces same result", async () => {
      await insertTestPair()
      await insertTestBond({
        chainId: CHAIN_ID,
        vaultAddress: getAddress(VAULT_ADDRESS),
        vaultTokenAddress: getAddress(VAULT_TOKEN_ADDRESS),
        stableTokenAddress: getAddress(STABLE_TOKEN_ADDRESS),
      })

      const event = buildBondRedeemedEvent(
        {
          redeemer: REDEEMER_ADDRESS,
          vaultToken: VAULT_TOKEN_ADDRESS,
          stableToken: STABLE_TOKEN_ADDRESS,
          vaultTokenAmount: 500000000000000000n,
          stableTokenAmount: 1500000000000000000n,
          performanceFeeAmount: 50000000000000000n,
        },
        {
          address: VAULT_ADDRESS,
          chainId: CHAIN_ID,
          blockNumber: BLOCK_NUMBER,
          blockTimestamp: BLOCK_TIMESTAMP,
          transactionHash: TX_HASH,
          logIndex: 0,
        },
      )

      await handleBondRedeemed(event)
      await handleBondRedeemed(event)

      const stored = await db
        .select()
        .from(bonds)
        .where(and(eq(bonds.chainId, CHAIN_ID), eq(bonds.vaultAddress, getAddress(VAULT_ADDRESS))))

      expect(stored).toHaveLength(1)
      expect(stored[0]?.vaultState).toBe(2)
    })
  })

  describe("error handling", () => {
    it("throws error when bond not found", async () => {
      const event = buildBondRedeemedEvent(
        {
          redeemer: REDEEMER_ADDRESS,
          vaultToken: VAULT_TOKEN_ADDRESS,
          stableToken: STABLE_TOKEN_ADDRESS,
          vaultTokenAmount: 500000000000000000n,
          stableTokenAmount: 1500000000000000000n,
          performanceFeeAmount: 50000000000000000n,
        },
        {
          address: VAULT_ADDRESS,
          chainId: CHAIN_ID,
          blockNumber: BLOCK_NUMBER,
          blockTimestamp: BLOCK_TIMESTAMP,
          transactionHash: TX_HASH,
          logIndex: 0,
        },
      )

      await expect(handleBondRedeemed(event)).rejects.toThrow(
        `Bond not found for vault ${getAddress(VAULT_ADDRESS)} on chain ${CHAIN_ID}`,
      )
    })

    it("throws error when blockNumber is null", async () => {
      await insertTestPair()
      await insertTestBond({
        chainId: CHAIN_ID,
        vaultAddress: getAddress(VAULT_ADDRESS),
        vaultTokenAddress: getAddress(VAULT_TOKEN_ADDRESS),
        stableTokenAddress: getAddress(STABLE_TOKEN_ADDRESS),
      })

      const event = buildBondRedeemedEvent(
        {
          redeemer: REDEEMER_ADDRESS,
          vaultToken: VAULT_TOKEN_ADDRESS,
          stableToken: STABLE_TOKEN_ADDRESS,
          vaultTokenAmount: 500000000000000000n,
          stableTokenAmount: 1500000000000000000n,
          performanceFeeAmount: 50000000000000000n,
        },
        {
          address: VAULT_ADDRESS,
          chainId: CHAIN_ID,
          blockTimestamp: BLOCK_TIMESTAMP,
          transactionHash: TX_HASH,
          logIndex: 0,
        },
      )

      // Mutate after building to bypass builder defaults
      ;(event as any).blockNumber = null

      await expect(handleBondRedeemed(event)).rejects.toThrow(
        /Missing required event metadata for BondRedeemed event/,
      )
    })

    it("throws error when blockTimestamp is undefined", async () => {
      await insertTestPair()
      await insertTestBond({
        chainId: CHAIN_ID,
        vaultAddress: getAddress(VAULT_ADDRESS),
        vaultTokenAddress: getAddress(VAULT_TOKEN_ADDRESS),
        stableTokenAddress: getAddress(STABLE_TOKEN_ADDRESS),
      })

      const event = buildBondRedeemedEvent(
        {
          redeemer: REDEEMER_ADDRESS,
          vaultToken: VAULT_TOKEN_ADDRESS,
          stableToken: STABLE_TOKEN_ADDRESS,
          vaultTokenAmount: 500000000000000000n,
          stableTokenAmount: 1500000000000000000n,
          performanceFeeAmount: 50000000000000000n,
        },
        {
          address: VAULT_ADDRESS,
          chainId: CHAIN_ID,
          blockNumber: BLOCK_NUMBER,
          transactionHash: TX_HASH,
          logIndex: 0,
        },
      )

      // Mutate after building to bypass builder defaults
      ;(event as any).blockTimestamp = undefined

      await expect(handleBondRedeemed(event)).rejects.toThrow(
        /Missing required event metadata for BondRedeemed event/,
      )
    })
  })
})

/**
 * Tests for BondIssued event handler
 * Verifies correct insertion and upsert behavior for bond state data
 */

import { getDb } from "@hodlbonds-api/db"
import { bonds, schema } from "@hodlbonds-api/db/schema/index"
import { and, eq } from "drizzle-orm"
import { reset } from "drizzle-seed"
import { getAddress } from "viem"
import { beforeEach, describe, expect, it } from "vitest"

import { buildBondIssuedEvent } from "@/test/helpers/event-builders"

import { handleBondIssued } from "../bond-issued"

const db = getDb()

describe("handleBondIssued", () => {
  // Test addresses (lowercase to test checksumming)
  const VAULT_ADDRESS = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  const CREATOR_ADDRESS = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  const VAULT_TOKEN_ADDRESS = "0xcccccccccccccccccccccccccccccccccccccccc"
  const STABLE_TOKEN_ADDRESS = "0xdddddddddddddddddddddddddddddddddddddddd"
  const CHAIN_ID = 43114

  beforeEach(async () => {
    await reset(db, schema)
  })

  describe("insert (new bond)", () => {
    it("inserts bond with correct ingestion details", async () => {
      const blockTimestamp = BigInt(Math.floor(Date.now() / 1000))
      const event = buildBondIssuedEvent(
        {
          creator: CREATOR_ADDRESS,
          vaultToken: VAULT_TOKEN_ADDRESS,
          stableToken: STABLE_TOKEN_ADDRESS,
          vaultTokenAmount: 50000000000000000000n, // 50 ETH
          stableTokenAmount: 100000000000000000000n, // 100 ETH
          managementFeeAmount: 5000000000000000000n, // 5 ETH
        },
        {
          address: VAULT_ADDRESS as `0x${string}`,
          chainId: CHAIN_ID,
          transactionHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
          blockNumber: 12345678n,
          blockTimestamp,
        },
      )

      await handleBondIssued(event)

      const stored = await db
        .select()
        .from(bonds)
        .where(and(eq(bonds.chainId, CHAIN_ID), eq(bonds.vaultAddress, getAddress(VAULT_ADDRESS))))

      expect(stored).toHaveLength(1)
      expect(stored[0]?.chainId).toBe(CHAIN_ID)
      expect(stored[0]?.txHash).toBe(
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      )
      expect(stored[0]?.blockNumber).toBe(12345678)
      expect(stored[0]?.blockTimestamp).toEqual(new Date(Number(blockTimestamp) * 1000))
    })

    it("inserts bond with checksummed addresses", async () => {
      const event = buildBondIssuedEvent(
        {
          creator: CREATOR_ADDRESS,
          vaultToken: VAULT_TOKEN_ADDRESS,
          stableToken: STABLE_TOKEN_ADDRESS,
          vaultTokenAmount: 1000000n,
          stableTokenAmount: 5000000n,
          managementFeeAmount: 50000n,
        },
        {
          address: VAULT_ADDRESS as `0x${string}`,
          chainId: CHAIN_ID,
        },
      )

      await handleBondIssued(event)

      const stored = await db
        .select()
        .from(bonds)
        .where(and(eq(bonds.chainId, CHAIN_ID), eq(bonds.vaultAddress, getAddress(VAULT_ADDRESS))))

      expect(stored).toHaveLength(1)
      // All addresses should be checksummed
      expect(stored[0]?.issuer).toBe(getAddress(CREATOR_ADDRESS))
      expect(stored[0]?.vaultAddress).toBe(getAddress(VAULT_ADDRESS))
      expect(stored[0]?.vaultTokenAddress).toBe(getAddress(VAULT_TOKEN_ADDRESS))
      expect(stored[0]?.stableTokenAddress).toBe(getAddress(STABLE_TOKEN_ADDRESS))
    })

    it("inserts bond with correct vault state", async () => {
      const event = buildBondIssuedEvent(
        {
          creator: CREATOR_ADDRESS,
          vaultToken: VAULT_TOKEN_ADDRESS,
          stableToken: STABLE_TOKEN_ADDRESS,
          vaultTokenAmount: 25000000000000000000n, // 25 ETH
          stableTokenAmount: 75000000000000000000n, // 75 ETH
          managementFeeAmount: 2500000000000000000n, // 2.5 ETH
        },
        {
          address: VAULT_ADDRESS as `0x${string}`,
          chainId: CHAIN_ID,
          blockNumber: 12345678n,
          blockTimestamp: BigInt(Math.floor(Date.now() / 1000)),
        },
      )

      await handleBondIssued(event)

      const stored = await db
        .select()
        .from(bonds)
        .where(and(eq(bonds.chainId, CHAIN_ID), eq(bonds.vaultAddress, getAddress(VAULT_ADDRESS))))

      expect(stored).toHaveLength(1)
      expect(stored[0]?.vaultState).toBe(1)
      expect(stored[0]?.startingVaultTokenBalance).toBe(25000000000000000000n)
      expect(stored[0]?.startingStableTokenBalance).toBe(75000000000000000000n)
      expect(stored[0]?.vaultTokenBalance).toBe(25000000000000000000n)
      expect(stored[0]?.stableTokenBalance).toBe(75000000000000000000n)
      expect(stored[0]?.balanceBlockNumber).toBe(12345678)
      expect(stored[0]?.balanceBlockTimestamp).toBeInstanceOf(Date)
      expect(stored[0]?.managementFeePaid).toBe(2500000000000000000n)
    })

    it("inserts bond with null factory data", async () => {
      const event = buildBondIssuedEvent(
        {
          creator: CREATOR_ADDRESS,
          vaultToken: VAULT_TOKEN_ADDRESS,
          stableToken: STABLE_TOKEN_ADDRESS,
          vaultTokenAmount: 1000000n,
          stableTokenAmount: 5000000n,
          managementFeeAmount: 50000n,
        },
        {
          address: VAULT_ADDRESS as `0x${string}`,
          chainId: CHAIN_ID,
        },
      )

      await handleBondIssued(event)

      const stored = await db
        .select()
        .from(bonds)
        .where(and(eq(bonds.chainId, CHAIN_ID), eq(bonds.vaultAddress, getAddress(VAULT_ADDRESS))))

      expect(stored).toHaveLength(1)
      // Factory data should all be null
      expect(stored[0]?.factoryAddress).toBeNull()
      expect(stored[0]?.receiptTokenAddress).toBeNull()
      expect(stored[0]?.managementFee).toBeNull()
      expect(stored[0]?.performanceFee).toBeNull()
      expect(stored[0]?.vaultId).toBeNull()
      expect(stored[0]?.bondPrice).toBeNull()
      expect(stored[0]?.reserveRatio).toBeNull()
      expect(stored[0]?.tradingPeriodDuration).toBeNull()
      expect(stored[0]?.tradingEndsAt).toBeNull()
      expect(stored[0]?.primaryDex).toBeNull()
      expect(stored[0]?.pairId).toBeNull()
    })

    it("throws when blockTimestamp is missing", async () => {
      const event = buildBondIssuedEvent(
        {
          creator: CREATOR_ADDRESS,
          vaultToken: VAULT_TOKEN_ADDRESS,
          stableToken: STABLE_TOKEN_ADDRESS,
          vaultTokenAmount: 1000000n,
          stableTokenAmount: 5000000n,
          managementFeeAmount: 50000n,
        },
        {
          address: VAULT_ADDRESS as `0x${string}`,
          chainId: CHAIN_ID,
          transactionHash: "0xdeadbeef00000000000000000000000000000000000000000000000000000000",
        },
      )

      // Explicitly remove blockTimestamp to test runtime behavior
      event.blockTimestamp = undefined

      await expect(handleBondIssued(event)).rejects.toThrow(
        "Missing required event metadata for BondIssued event",
      )
    })
  })

  describe("upsert (existing bond from VaultCreated)", () => {
    const FACTORY_ADDRESS = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    const RECEIPT_TOKEN_ADDRESS = "0xffffffffffffffffffffffffffffffffffffffff"

    beforeEach(async () => {
      // Pre-insert a bond record as if VaultCreated event was processed first
      // This simulates the typical flow: VaultCreated → BondIssued
      await db.insert(bonds).values({
        chainId: CHAIN_ID,
        txHash: "0x0000000000000000000000000000000000000000000000000000000000000001",
        blockNumber: 12340000,
        blockTimestamp: new Date("2025-01-01T00:00:00Z"),

        issuer: getAddress(CREATOR_ADDRESS),
        vaultAddress: getAddress(VAULT_ADDRESS),
        vaultTokenAddress: getAddress(VAULT_TOKEN_ADDRESS),
        stableTokenAddress: getAddress(STABLE_TOKEN_ADDRESS),

        // Factory data from VaultCreated
        factoryAddress: getAddress(FACTORY_ADDRESS),
        receiptTokenAddress: getAddress(RECEIPT_TOKEN_ADDRESS),
        managementFee: 100,
        performanceFee: 200,
        vaultId: 42,
        bondPrice: 10000000000000000000n, // 10 ETH
        reserveRatio: 5000,
        tradingPeriodDuration: 86400,
        tradingEndsAt: new Date("2025-02-01T00:00:00Z"),
        primaryDex: 1,
        pairId: null, // May be null initially

        // Vault state is null until BondIssued
        vaultState: null,
        startingStableTokenBalance: null,
        startingVaultTokenBalance: null,
        stableTokenBalance: null,
        vaultTokenBalance: null,
        balanceBlockNumber: null,
        balanceBlockTimestamp: null,
        lastSwapBlockNumber: null,
        lastSwapBlockTimestamp: null,
        finalStableTokenBalance: null,
        finalVaultTokenBalance: null,
        settledBlockNumber: null,
        settledBlockTimestamp: null,
        settledBy: null,
        managementFeePaid: null,
        performanceFeePaid: null,
      })
    })

    it("updates vault state fields on conflict", async () => {
      const bondIssuedTimestamp = BigInt(
        Math.floor(new Date("2025-01-15T12:00:00Z").getTime() / 1000),
      )
      const event = buildBondIssuedEvent(
        {
          creator: CREATOR_ADDRESS,
          vaultToken: VAULT_TOKEN_ADDRESS,
          stableToken: STABLE_TOKEN_ADDRESS,
          vaultTokenAmount: 20000000000000000000n, // 20 ETH
          stableTokenAmount: 50000000000000000000n, // 50 ETH
          managementFeeAmount: 1000000000000000000n, // 1 ETH
        },
        {
          address: VAULT_ADDRESS as `0x${string}`,
          chainId: CHAIN_ID,
          blockNumber: 12345678n,
          blockTimestamp: bondIssuedTimestamp,
        },
      )

      await handleBondIssued(event)

      const stored = await db
        .select()
        .from(bonds)
        .where(and(eq(bonds.chainId, CHAIN_ID), eq(bonds.vaultAddress, getAddress(VAULT_ADDRESS))))

      expect(stored).toHaveLength(1)
      // Vault state should be updated
      expect(stored[0]?.vaultState).toBe(1)
      expect(stored[0]?.startingVaultTokenBalance).toBe(20000000000000000000n)
      expect(stored[0]?.startingStableTokenBalance).toBe(50000000000000000000n)
      expect(stored[0]?.vaultTokenBalance).toBe(20000000000000000000n)
      expect(stored[0]?.stableTokenBalance).toBe(50000000000000000000n)
      expect(stored[0]?.balanceBlockNumber).toBe(12345678)
      expect(stored[0]?.balanceBlockTimestamp).toEqual(new Date("2025-01-15T12:00:00Z"))
      expect(stored[0]?.managementFeePaid).toBe(1000000000000000000n)
    })

    it("preserves factory data from VaultCreated on conflict", async () => {
      const event = buildBondIssuedEvent(
        {
          creator: CREATOR_ADDRESS,
          vaultToken: VAULT_TOKEN_ADDRESS,
          stableToken: STABLE_TOKEN_ADDRESS,
          vaultTokenAmount: 15000000000000000000n, // 15 ETH
          stableTokenAmount: 30000000000000000000n, // 30 ETH
          managementFeeAmount: 1500000000000000000n, // 1.5 ETH
        },
        {
          address: VAULT_ADDRESS as `0x${string}`,
          chainId: CHAIN_ID,
        },
      )

      await handleBondIssued(event)

      const stored = await db
        .select()
        .from(bonds)
        .where(and(eq(bonds.chainId, CHAIN_ID), eq(bonds.vaultAddress, getAddress(VAULT_ADDRESS))))

      expect(stored).toHaveLength(1)
      // Factory data should be preserved from original insert
      expect(stored[0]?.factoryAddress).toBe(getAddress(FACTORY_ADDRESS))
      expect(stored[0]?.receiptTokenAddress).toBe(getAddress(RECEIPT_TOKEN_ADDRESS))
      expect(stored[0]?.managementFee).toBe(100)
      expect(stored[0]?.performanceFee).toBe(200)
      expect(stored[0]?.vaultId).toBe(42)
      expect(stored[0]?.bondPrice).toBe(10000000000000000000n) // 10 ETH
      expect(stored[0]?.reserveRatio).toBe(5000)
      expect(stored[0]?.tradingPeriodDuration).toBe(86400)
      expect(stored[0]?.tradingEndsAt).toEqual(new Date("2025-02-01T00:00:00Z"))
      expect(stored[0]?.primaryDex).toBe(1)
    })

    it("preserves original ingestion details from VaultCreated on conflict", async () => {
      const event = buildBondIssuedEvent(
        {
          creator: CREATOR_ADDRESS,
          vaultToken: VAULT_TOKEN_ADDRESS,
          stableToken: STABLE_TOKEN_ADDRESS,
          vaultTokenAmount: 12000000000000000000n, // 12 ETH
          stableTokenAmount: 35000000000000000000n, // 35 ETH
          managementFeeAmount: 1200000000000000000n, // 1.2 ETH
        },
        {
          address: VAULT_ADDRESS as `0x${string}`,
          chainId: CHAIN_ID,
          // Different transaction from original
          transactionHash: "0x0000000000000000000000000000000000000000000000000000000000000002",
          blockNumber: 12345678n,
          blockTimestamp: BigInt(Math.floor(new Date("2025-01-15T12:00:00Z").getTime() / 1000)),
        },
      )

      await handleBondIssued(event)

      const stored = await db
        .select()
        .from(bonds)
        .where(and(eq(bonds.chainId, CHAIN_ID), eq(bonds.vaultAddress, getAddress(VAULT_ADDRESS))))

      expect(stored).toHaveLength(1)
      // Ingestion details should be preserved from VaultCreated insert
      expect(stored[0]?.txHash).toBe(
        "0x0000000000000000000000000000000000000000000000000000000000000001",
      )
      expect(stored[0]?.blockNumber).toBe(12340000)
      expect(stored[0]?.blockTimestamp).toEqual(new Date("2025-01-01T00:00:00Z"))
    })
  })
})

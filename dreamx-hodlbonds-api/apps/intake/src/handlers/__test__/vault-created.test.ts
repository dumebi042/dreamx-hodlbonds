/**
 * Tests for VaultCreated event handler
 * Verifies correct insertion and upsert behavior for bond factory data
 */

import { faker } from "@faker-js/faker"
import { getDb } from "@hodlbonds-api/db"
import { bonds, pairs, schema } from "@hodlbonds-api/db/schema/index"
import { and, eq } from "drizzle-orm"
import { reset } from "drizzle-seed"
import { getAddress } from "viem"
import { beforeEach, describe, expect, it } from "vitest"

import { buildVaultCreatedEvent } from "@/test/helpers/event-builders"

import { handleVaultCreated } from "../vault-created"

const db = getDb()

describe("handleVaultCreated", () => {
  // Test addresses (lowercase to test checksumming)
  const FACTORY_ADDRESS = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  const VAULT_ADDRESS = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  const CREATOR_ADDRESS = "0xcccccccccccccccccccccccccccccccccccccccc"
  const VAULT_TOKEN_ADDRESS = "0xdddddddddddddddddddddddddddddddddddddddd"
  const STABLE_TOKEN_ADDRESS = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
  const CHAIN_ID = 43114
  const VAULT_ID = 42n
  const PAIR_ID = 1n

  // Helper to create approved pair object
  const createApprovedPair = () => ({
    factoryAddress: getAddress(FACTORY_ADDRESS),
    stableTokenAddress: STABLE_TOKEN_ADDRESS as `0x${string}`,
    vaultTokenAddress: VAULT_TOKEN_ADDRESS as `0x${string}`,
    wrappedNativeTokenAddress: faker.finance.ethereumAddress() as `0x${string}`,
    routerAddress: faker.finance.ethereumAddress() as `0x${string}`,
    tokenPairAddress: faker.finance.ethereumAddress() as `0x${string}`,
    version: 1,
    routerV2Address: faker.finance.ethereumAddress() as `0x${string}`,
    pairAddress: faker.finance.ethereumAddress() as `0x${string}`,
    concentrated: false,
    chainlinkPriceOracleAddress: faker.finance.ethereumAddress() as `0x${string}`,
  })

  // Helper to create vault parameters object
  const createVaultParameters = ({
    vaultId,
    bondPrice,
  }: {
    vaultId: bigint
    bondPrice: bigint
  }) => ({
    vaultId: vaultId,
    stableTokenAddress: STABLE_TOKEN_ADDRESS as `0x${string}`,
    vaultTokenAddress: VAULT_TOKEN_ADDRESS as `0x${string}`,
    receiptTokenAddress: faker.finance.ethereumAddress() as `0x${string}`,
    chainlinkPriceOracleAddress: faker.finance.ethereumAddress() as `0x${string}`,
    minUSDPricePerBond: 100000000n,
    feeSplitterAddress: faker.finance.ethereumAddress() as `0x${string}`,
    managementFee: 200,
    performanceFee: 2000,
    bondPrice,
    reserveRatio: 5000,
    tradingPeriodDuration: 86400,
    primaryDex: 1,
  })

  beforeEach(async () => {
    await reset(db, schema)

    // Insert test pair that bonds will reference
    await db.insert(pairs).values({
      ...createApprovedPair(),
      id: Number(PAIR_ID),
      chainId: CHAIN_ID,
      stableTokenAddress: STABLE_TOKEN_ADDRESS,
      vaultTokenAddress: VAULT_TOKEN_ADDRESS,
    })
  })

  describe("insert (new bond)", () => {
    it("inserts bond with correct ingestion details", async () => {
      const blockTimestamp = BigInt(Math.floor(Date.now() / 1000))
      const event = buildVaultCreatedEvent(
        {
          creator: CREATOR_ADDRESS,
          vaultId: VAULT_ID,
          vaultAddress: VAULT_ADDRESS,
          pairId: PAIR_ID,
          approvedPair: createApprovedPair(),
          vaultParameters: createVaultParameters({
            vaultId: VAULT_ID,
            bondPrice: 10000000000000000000n,
          }), // 10 ETH
        },
        {
          address: FACTORY_ADDRESS,
          chainId: CHAIN_ID,
          transactionHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
          blockNumber: 12345678n,
          blockTimestamp,
        },
      )

      await handleVaultCreated(event)

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
      const event = buildVaultCreatedEvent(
        {
          creator: CREATOR_ADDRESS,
          vaultId: VAULT_ID,
          vaultAddress: VAULT_ADDRESS,
          pairId: PAIR_ID,
          approvedPair: createApprovedPair(),
          vaultParameters: createVaultParameters({
            vaultId: VAULT_ID,
            bondPrice: 10000000000000000000n,
          }),
        },
        {
          address: FACTORY_ADDRESS,
          chainId: CHAIN_ID,
        },
      )

      await handleVaultCreated(event)

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
      expect(stored[0]?.factoryAddress).toBe(getAddress(FACTORY_ADDRESS))
    })

    it("inserts bond with correct factory data", async () => {
      const blockTimestamp = BigInt(Math.floor(new Date("2025-01-01T00:00:00Z").getTime() / 1000))
      const event = buildVaultCreatedEvent(
        {
          creator: CREATOR_ADDRESS,
          vaultId: VAULT_ID,
          vaultAddress: VAULT_ADDRESS,
          pairId: PAIR_ID,
          approvedPair: createApprovedPair(),
          vaultParameters: createVaultParameters({
            vaultId: VAULT_ID,
            bondPrice: 50000000000000000000n,
          }), // 50 ETH
        },
        {
          address: FACTORY_ADDRESS,
          chainId: CHAIN_ID,
          blockNumber: 12345678n,
          blockTimestamp,
        },
      )

      await handleVaultCreated(event)

      const stored = await db
        .select()
        .from(bonds)
        .where(and(eq(bonds.chainId, CHAIN_ID), eq(bonds.vaultAddress, getAddress(VAULT_ADDRESS))))

      expect(stored).toHaveLength(1)
      expect(stored[0]?.factoryAddress).toBe(getAddress(FACTORY_ADDRESS))
      expect(stored[0]?.vaultId).toBe(42)
      expect(stored[0]?.bondPrice).toBe(50000000000000000000n)
      expect(stored[0]?.reserveRatio).toBe(5000)
      expect(stored[0]?.tradingPeriodDuration).toBe(86400)
      expect(stored[0]?.tradingEndsAt).toEqual(
        new Date(Number(blockTimestamp) * 1000 + 86400 * 1000),
      )
      expect(stored[0]?.primaryDex).toBe(1)
      expect(stored[0]?.pairId).toBe(1)
    })

    it("inserts bond with null vault state", async () => {
      const event = buildVaultCreatedEvent(
        {
          creator: CREATOR_ADDRESS,
          vaultId: VAULT_ID,
          vaultAddress: VAULT_ADDRESS,
          pairId: PAIR_ID,
          approvedPair: createApprovedPair(),
          vaultParameters: createVaultParameters({
            vaultId: VAULT_ID,
            bondPrice: 10000000000000000000n,
          }),
        },
        {
          address: FACTORY_ADDRESS,
          chainId: CHAIN_ID,
        },
      )

      await handleVaultCreated(event)

      const stored = await db
        .select()
        .from(bonds)
        .where(and(eq(bonds.chainId, CHAIN_ID), eq(bonds.vaultAddress, getAddress(VAULT_ADDRESS))))

      expect(stored).toHaveLength(1)
      // Vault state should all be null until BondIssued
      expect(stored[0]?.vaultState).toBeNull()
      expect(stored[0]?.startingStableTokenBalance).toBeNull()
      expect(stored[0]?.startingVaultTokenBalance).toBeNull()
      expect(stored[0]?.stableTokenBalance).toBeNull()
      expect(stored[0]?.vaultTokenBalance).toBeNull()
      expect(stored[0]?.balanceBlockNumber).toBeNull()
      expect(stored[0]?.balanceBlockTimestamp).toBeNull()
      expect(stored[0]?.managementFeePaid).toBeNull()
      expect(stored[0]?.performanceFeePaid).toBeNull()
    })

    it("throws when blockTimestamp is missing", async () => {
      const event = buildVaultCreatedEvent(
        {
          creator: CREATOR_ADDRESS,
          vaultId: VAULT_ID,
          vaultAddress: VAULT_ADDRESS,
          pairId: PAIR_ID,
          approvedPair: createApprovedPair(),
          vaultParameters: createVaultParameters({
            vaultId: VAULT_ID,
            bondPrice: 10000000000000000000n,
          }),
        },
        {
          address: FACTORY_ADDRESS,
          chainId: CHAIN_ID,
          transactionHash: "0xdeadbeef00000000000000000000000000000000000000000000000000000000",
        },
      )

      // Explicitly remove blockTimestamp to test runtime behavior
      event.blockTimestamp = undefined

      await expect(handleVaultCreated(event)).rejects.toThrow(
        "Missing required event metadata for VaultCreated event",
      )
    })
  })

  describe("upsert (existing bond from BondIssued)", () => {
    beforeEach(async () => {
      // Pre-insert a bond record as if BondIssued event was processed first
      // This simulates the flow: BondIssued → VaultCreated
      await db.insert(bonds).values({
        chainId: CHAIN_ID,
        txHash: "0x0000000000000000000000000000000000000000000000000000000000000001",
        blockNumber: 12340000,
        blockTimestamp: new Date("2025-01-01T00:00:00Z"),

        issuer: getAddress(CREATOR_ADDRESS),
        vaultAddress: getAddress(VAULT_ADDRESS),
        vaultTokenAddress: getAddress(VAULT_TOKEN_ADDRESS),
        stableTokenAddress: getAddress(STABLE_TOKEN_ADDRESS),

        // Factory data is null until VaultCreated
        factoryAddress: null,
        receiptTokenAddress: null,
        managementFee: null,
        performanceFee: null,
        vaultId: null,
        bondPrice: null,
        reserveRatio: null,
        tradingPeriodDuration: null,
        tradingEndsAt: null,
        primaryDex: null,
        pairId: null,

        // Vault state from BondIssued
        vaultState: 1,
        startingStableTokenBalance: 75000000000000000000n, // 75 ETH - exceeds bigint limit
        startingVaultTokenBalance: 25000000000000000000n, // 25 ETH - exceeds bigint limit
        stableTokenBalance: 75000000000000000000n,
        vaultTokenBalance: 25000000000000000000n,
        balanceBlockNumber: 12340000,
        balanceBlockTimestamp: new Date("2025-01-01T00:00:00Z"),
        lastSwapBlockNumber: null,
        lastSwapBlockTimestamp: null,
        finalStableTokenBalance: null,
        finalVaultTokenBalance: null,
        settledBlockNumber: null,
        settledBlockTimestamp: null,
        settledBy: null,
        managementFeePaid: 2500000000000000000n, // 2.5 ETH
        performanceFeePaid: null,
      })
    })

    it("updates factory data on conflict", async () => {
      const vaultCreatedTimestamp = BigInt(
        Math.floor(new Date("2025-01-15T12:00:00Z").getTime() / 1000),
      )
      const event = buildVaultCreatedEvent(
        {
          creator: CREATOR_ADDRESS,
          vaultId: VAULT_ID,
          vaultAddress: VAULT_ADDRESS,
          pairId: PAIR_ID,
          approvedPair: createApprovedPair(),
          vaultParameters: createVaultParameters({
            vaultId: VAULT_ID,
            bondPrice: 100000000000000000000n,
          }), // 100 ETH
        },
        {
          address: FACTORY_ADDRESS as `0x${string}`,
          chainId: CHAIN_ID,
          blockNumber: 12345678n,
          blockTimestamp: vaultCreatedTimestamp,
        },
      )

      await handleVaultCreated(event)

      const stored = await db
        .select()
        .from(bonds)
        .where(and(eq(bonds.chainId, CHAIN_ID), eq(bonds.vaultAddress, getAddress(VAULT_ADDRESS))))

      expect(stored).toHaveLength(1)
      // Factory data should be updated
      expect(stored[0]?.factoryAddress).toBe(getAddress(FACTORY_ADDRESS))
      expect(stored[0]?.vaultId).toBe(42)
      expect(stored[0]?.bondPrice).toBe(100000000000000000000n)
      expect(stored[0]?.reserveRatio).toBe(5000)
      expect(stored[0]?.tradingPeriodDuration).toBe(86400)
      expect(stored[0]?.tradingEndsAt).toEqual(new Date("2025-01-16T12:00:00Z"))
      expect(stored[0]?.primaryDex).toBe(1)
      expect(stored[0]?.pairId).toBe(1)
    })

    it("preserves vault state from BondIssued on conflict", async () => {
      const event = buildVaultCreatedEvent(
        {
          creator: CREATOR_ADDRESS,
          vaultId: VAULT_ID,
          vaultAddress: VAULT_ADDRESS,
          pairId: PAIR_ID,
          approvedPair: createApprovedPair(),
          vaultParameters: createVaultParameters({
            vaultId: VAULT_ID,
            bondPrice: 100000000000000000000n,
          }),
        },
        {
          address: FACTORY_ADDRESS,
          chainId: CHAIN_ID,
        },
      )

      await handleVaultCreated(event)

      const stored = await db
        .select()
        .from(bonds)
        .where(and(eq(bonds.chainId, CHAIN_ID), eq(bonds.vaultAddress, getAddress(VAULT_ADDRESS))))

      expect(stored).toHaveLength(1)
      // Vault state should be preserved from BondIssued
      expect(stored[0]?.vaultState).toBe(1)
      expect(stored[0]?.startingStableTokenBalance).toBe(75000000000000000000n)
      expect(stored[0]?.startingVaultTokenBalance).toBe(25000000000000000000n)
      expect(stored[0]?.stableTokenBalance).toBe(75000000000000000000n)
      expect(stored[0]?.vaultTokenBalance).toBe(25000000000000000000n)
      expect(stored[0]?.balanceBlockNumber).toBe(12340000)
      expect(stored[0]?.balanceBlockTimestamp).toEqual(new Date("2025-01-01T00:00:00Z"))
      expect(stored[0]?.managementFeePaid).toBe(2500000000000000000n)
    })

    it("preserves original ingestion details from BondIssued on conflict", async () => {
      const event = buildVaultCreatedEvent(
        {
          creator: CREATOR_ADDRESS,
          vaultId: VAULT_ID,
          vaultAddress: VAULT_ADDRESS,
          pairId: PAIR_ID,
          approvedPair: createApprovedPair(),
          vaultParameters: createVaultParameters({
            vaultId: VAULT_ID,
            bondPrice: 100000000000000000000n,
          }),
        },
        {
          address: FACTORY_ADDRESS,
          chainId: CHAIN_ID,
          // Different transaction from original
          transactionHash: "0x0000000000000000000000000000000000000000000000000000000000000002",
          blockNumber: 12345678n,
          blockTimestamp: BigInt(Math.floor(new Date("2025-01-15T12:00:00Z").getTime() / 1000)),
        },
      )

      await handleVaultCreated(event)

      const stored = await db
        .select()
        .from(bonds)
        .where(and(eq(bonds.chainId, CHAIN_ID), eq(bonds.vaultAddress, getAddress(VAULT_ADDRESS))))

      expect(stored).toHaveLength(1)
      // Ingestion details should be preserved from BondIssued insert
      expect(stored[0]?.txHash).toBe(
        "0x0000000000000000000000000000000000000000000000000000000000000001",
      )
      expect(stored[0]?.blockNumber).toBe(12340000)
      expect(stored[0]?.blockTimestamp).toEqual(new Date("2025-01-01T00:00:00Z"))
    })
  })
})

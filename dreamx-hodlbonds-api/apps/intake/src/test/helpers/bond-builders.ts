/**
 * Test helpers for inserting bonds and related data into the database
 */

import { faker } from "@faker-js/faker"
import { getDb } from "@hodlbonds-api/db"
import {
  bonds,
  listings,
  marketplaceTokenSets,
  pairs,
  receiptTokenBalances,
} from "@hodlbonds-api/db/schema/index"
import { getAddress, type Address } from "viem"

const db = getDb()

/**
 * Default test pair ID used across tests
 */
export const DEFAULT_TEST_PAIR_ID = 1

/**
 * Default test chain ID (Avalanche)
 */
export const DEFAULT_TEST_CHAIN_ID = 43114

/**
 * Default test factory address used across tests
 */
export const DEFAULT_TEST_FACTORY_ADDRESS = getAddress("0x1111111111111111111111111111111111111111")

/**
 * Insert a test pair into the database
 * This is required before inserting bonds due to foreign key constraint
 */
export async function insertTestPair(overrides?: Partial<typeof pairs.$inferInsert>) {
  const pairData = {
    id: DEFAULT_TEST_PAIR_ID,
    chainId: DEFAULT_TEST_CHAIN_ID,
    factoryAddress: DEFAULT_TEST_FACTORY_ADDRESS,
    stableTokenAddress: getAddress(faker.finance.ethereumAddress()),
    vaultTokenAddress: getAddress(faker.finance.ethereumAddress()),
    wrappedNativeTokenAddress: getAddress(faker.finance.ethereumAddress()),
    routerAddress: getAddress(faker.finance.ethereumAddress()),
    tokenPairAddress: getAddress(faker.finance.ethereumAddress()),
    version: 1,
    routerV2Address: getAddress(faker.finance.ethereumAddress()),
    pairAddress: getAddress(faker.finance.ethereumAddress()),
    concentrated: false,
    chainlinkPriceOracleAddress: getAddress(faker.finance.ethereumAddress()),
    ...overrides,
  }

  await db.insert(pairs).values(pairData)
  return pairData
}

/**
 * Insert a complete test bond into the database
 * Combines both factory data (VaultCreated) and vault state (BondIssued)
 * Does NOT include settlement/final state
 */
export async function insertTestBond(overrides?: Partial<typeof bonds.$inferInsert>) {
  // Generate unique block numbers to avoid conflicts
  // Use a base timestamp and increment from there
  const baseBlockNumber = faker.number.int({ min: 10000000, max: 20000000 })
  const baseTimestamp = faker.date.recent({ days: 30 })

  const bondData = {
    chainId: DEFAULT_TEST_CHAIN_ID,
    txHash: faker.string.hexadecimal({ length: 64, prefix: "0x" }) as `0x${string}`,
    blockNumber: baseBlockNumber,
    blockTimestamp: baseTimestamp,

    // Addresses
    issuer: getAddress(faker.finance.ethereumAddress()),
    vaultAddress: getAddress(faker.finance.ethereumAddress()),
    vaultTokenAddress: getAddress(faker.finance.ethereumAddress()),
    stableTokenAddress: getAddress(faker.finance.ethereumAddress()),

    // Factory data (from VaultCreated)
    factoryAddress: DEFAULT_TEST_FACTORY_ADDRESS,
    receiptTokenAddress: getAddress(faker.finance.ethereumAddress()),
    managementFee: 200,
    performanceFee: 2000,
    vaultId: faker.number.int({ min: 1, max: 1000 }),
    bondPrice: BigInt(faker.number.int({ min: 1, max: 100 })) * 10n ** 18n, // 1-100 ETH
    reserveRatio: 5000, // 50%
    tradingPeriodDuration: 86400, // 1 day
    tradingEndsAt: new Date(baseTimestamp.getTime() + 86400 * 1000),
    primaryDex: 1,
    pairId: DEFAULT_TEST_PAIR_ID,

    // Vault state (from BondIssued)
    vaultState: 1, // Active
    startingStableTokenBalance: BigInt(faker.number.int({ min: 10, max: 200 })) * 10n ** 18n,
    startingVaultTokenBalance: BigInt(faker.number.int({ min: 10, max: 200 })) * 10n ** 18n,
    stableTokenBalance: BigInt(faker.number.int({ min: 10, max: 200 })) * 10n ** 18n,
    vaultTokenBalance: BigInt(faker.number.int({ min: 10, max: 200 })) * 10n ** 18n,
    balanceBlockNumber: baseBlockNumber,
    balanceBlockTimestamp: baseTimestamp,
    lastSwapBlockNumber: null, // No trades yet
    lastSwapBlockTimestamp: null,
    managementFeePaid: BigInt(faker.number.int({ min: 0, max: 10 })) * 10n ** 18n,
    performanceFeePaid: null,

    // Settlement data (not filled for active bonds)
    finalStableTokenBalance: null,
    finalVaultTokenBalance: null,
    settledBlockNumber: null,
    settledBlockTimestamp: null,
    settledBy: null,

    ...overrides,
  }

  const [inserted] = await db.insert(bonds).values(bondData).returning()
  // Cast addresses to proper viem Address type for test consumption
  return {
    ...inserted!,
    issuer: inserted!.issuer as Address,
    vaultAddress: inserted!.vaultAddress as Address,
    vaultTokenAddress: inserted!.vaultTokenAddress as Address,
    stableTokenAddress: inserted!.stableTokenAddress as Address,
    factoryAddress: inserted!.factoryAddress as Address,
  }
}

/**
 * Default test marketplace address used across tests
 */
export const DEFAULT_TEST_MARKETPLACE_ADDRESS = getAddress(
  "0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa",
)

/**
 * Default test receipt token address used across tests
 */
export const DEFAULT_TEST_RECEIPT_TOKEN_ADDRESS = getAddress(
  "0xBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBb",
)

/**
 * Default test price token address used across tests
 */
export const DEFAULT_TEST_PRICE_TOKEN_ADDRESS = getAddress(
  "0xCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCc",
)

/**
 * Insert a test marketplace token set into the database
 * This is required before inserting listings due to foreign key constraint
 */
export async function insertTestTokenSet(
  overrides?: Partial<typeof marketplaceTokenSets.$inferInsert>,
) {
  const tokenSetData = {
    chainId: DEFAULT_TEST_CHAIN_ID,
    marketplaceAddress: DEFAULT_TEST_MARKETPLACE_ADDRESS,
    tokenSetId: 1,
    receiptTokenAddress: DEFAULT_TEST_RECEIPT_TOKEN_ADDRESS,
    priceTokenAddress: DEFAULT_TEST_PRICE_TOKEN_ADDRESS,
    ...overrides,
  }

  await db.insert(marketplaceTokenSets).values(tokenSetData)
  return tokenSetData
}

/**
 * Insert a test listing into the database
 * Requires a bond and token set to already exist due to foreign key constraints
 */
export async function insertTestListing(overrides?: Partial<typeof listings.$inferInsert>) {
  const listingData = {
    chainId: DEFAULT_TEST_CHAIN_ID,
    marketplaceAddress: DEFAULT_TEST_MARKETPLACE_ADDRESS,
    listingId: faker.number.int({ min: 1, max: 10000 }),
    txHash: faker.string.hexadecimal({ length: 64, prefix: "0x" }) as `0x${string}`,
    blockNumber: faker.number.int({ min: 1000000, max: 20000000 }),
    blockTimestamp: faker.date.recent({ days: 30 }),
    receiptTokenAddress: DEFAULT_TEST_RECEIPT_TOKEN_ADDRESS,
    tokenId: faker.number.int({ min: 1, max: 1000 }),
    status: "active" as const,
    seller: getAddress(faker.finance.ethereumAddress()),
    buyer: null,
    price: BigInt(faker.number.int({ min: 1, max: 100 })) * 10n ** 18n,
    priceTokenAddress: DEFAULT_TEST_PRICE_TOKEN_ADDRESS,
    quantity: 1,
    ...overrides,
  }

  await db.insert(listings).values(listingData)
  return listingData
}

/**
 * Insert a test receipt token balance into the database
 * Requires a bond to already exist due to foreign key constraints
 */
export async function insertTestBalance(
  overrides?: Partial<typeof receiptTokenBalances.$inferInsert>,
) {
  const balanceData = {
    chainId: DEFAULT_TEST_CHAIN_ID,
    receiptTokenAddress: DEFAULT_TEST_RECEIPT_TOKEN_ADDRESS,
    tokenId: 1,
    ownerAddress: getAddress(faker.finance.ethereumAddress()),
    balance: 1n,
    lastUpdateBlockNumber: faker.number.int({ min: 1000000, max: 20000000 }),
    lastUpdateBlockTimestamp: faker.date.recent({ days: 30 }),
    ...overrides,
  }

  await db.insert(receiptTokenBalances).values(balanceData)
  return balanceData
}

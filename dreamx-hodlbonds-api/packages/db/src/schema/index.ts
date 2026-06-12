import {
  boolean,
  char,
  foreignKey,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm/relations"
import { desc } from "drizzle-orm/sql/expressions/select"
import { sql } from "drizzle-orm/sql/sql"

import { bigintJsonb } from "../types/bigint-jsonb"

export const eventStatusEnum = pgEnum("event_status", ["pending", "success", "failed"])

export const transferTypeEnum = pgEnum("transfer_type", [
  "transfer",
  "mint",
  "burn",
  "marketplace",
  "loan",
])

export const listingStatusEnum = pgEnum("listing_status", ["active", "completed", "cancelled"])

export const intakeEvents = pgTable(
  "intake_events",
  {
    chainId: integer("chain_id").notNull(),
    txHash: char("tx_hash", { length: 66 }).notNull(),
    logIndex: integer("log_index").notNull(),
    blockNumber: integer("block_number").notNull(),
    blockTimestamp: timestamp("block_timestamp", { precision: 0, withTimezone: true }),
    // Raw Log (before decoding) - always stored immediately
    rawLog: bigintJsonb("raw_log").notNull(),
    // Decoded event data - null until decode succeeds
    eventName: text("event_name"),
    args: bigintJsonb("args"),
    // Processing status and error
    status: eventStatusEnum("status").notNull().default("pending"),
    error: text("error"),
    receivedAt: timestamp("received_at", { precision: 3, withTimezone: true })
      .notNull()
      .defaultNow(),
    processedAt: timestamp("processed_at", { precision: 3, withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.chainId, table.txHash, table.logIndex] }),
    index("intake_events_name_idx").on(table.eventName),
    index("intake_events_status_idx").on(table.status),
    index("intake_events_block_number_idx").on(table.blockNumber),
    index("intake_events_block_timestamp_idx").on(table.blockTimestamp),
    index("intake_events_received_at_idx").on(table.receivedAt),
  ],
)

export const bonds = pgTable(
  "bonds",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    createdAt: timestamp("created_at", { precision: 3, withTimezone: true }).notNull().defaultNow(),

    // Ingestion details
    chainId: integer("chain_id").notNull(),
    txHash: char("tx_hash", { length: 66 }).notNull(),
    blockNumber: integer("block_number").notNull(),
    blockTimestamp: timestamp("block_timestamp", { precision: 0, withTimezone: true }).notNull(),

    issuer: char("issuer", { length: 42 }).notNull(),
    vaultAddress: char("vault_address", { length: 42 }).notNull(),
    vaultTokenAddress: char("vault_token_address", { length: 42 }).notNull(),
    stableTokenAddress: char("stable_token_address", { length: 42 }).notNull(),

    // Bond creation details from Factory event
    factoryAddress: char("factory_address", { length: 42 }),
    receiptTokenAddress: char("receipt_token_address", { length: 42 }),
    managementFee: integer("management_fee"),
    managementFeePaid: numeric("management_fee_paid", { precision: 78, scale: 0, mode: "bigint" }),
    performanceFee: integer("performance_fee"),
    performanceFeePaid: numeric("performance_fee_paid", {
      precision: 78,
      scale: 0,
      mode: "bigint",
    }),

    vaultId: integer("vault_id"),
    bondPrice: numeric("bond_price", { precision: 78, scale: 0, mode: "bigint" }), // i.e. par?  same as deposited amount of variable, but just leave for the factory event to fill in
    reserveRatio: integer("reserve_ratio"),
    tradingPeriodDuration: integer("trading_period_duration"),
    tradingEndsAt: timestamp("trading_ends_at", { precision: 0, withTimezone: true }),
    primaryDex: integer("primary_dex"),
    pairId: integer("pair_id"),

    // State from Vault event
    vaultState: integer("vault_state"),
    startingStableTokenBalance: numeric("starting_stable_token_balance", {
      precision: 78,
      scale: 0,
      mode: "bigint",
    }),
    startingVaultTokenBalance: numeric("starting_vault_token_balance", {
      precision: 78,
      scale: 0,
      mode: "bigint",
    }),
    stableTokenBalance: numeric("stable_token_balance", {
      precision: 78,
      scale: 0,
      mode: "bigint",
    }),
    vaultTokenBalance: numeric("vault_token_balance", { precision: 78, scale: 0, mode: "bigint" }),
    balanceBlockNumber: integer("balance_block_number"),
    balanceBlockTimestamp: timestamp("balance_block_timestamp", {
      precision: 0,
      withTimezone: true,
    }),
    lastSwapBlockNumber: integer("last_swap_block_number"),
    lastSwapBlockTimestamp: timestamp("last_swap_block_timestamp", {
      precision: 0,
      withTimezone: true,
    }),
    finalStableTokenBalance: numeric("final_stable_token_balance", {
      precision: 78,
      scale: 0,
      mode: "bigint",
    }),
    finalVaultTokenBalance: numeric("final_vault_token_balance", {
      precision: 78,
      scale: 0,
      mode: "bigint",
    }),
    settledBlockNumber: integer("settled_block_number"),
    settledBlockTimestamp: timestamp("settled_block_timestamp", {
      precision: 0,
      withTimezone: true,
    }),
    settledBy: char("settled_by", { length: 42 }),

    isComplete: boolean("is_complete").generatedAlwaysAs(
      sql`factory_address IS NOT NULL AND vault_state IS NOT NULL`,
    ),
  },
  (table) => [
    unique("bonds_chain_vault_unique").on(table.chainId, table.vaultAddress),
    unique("bonds_chain_receipt_vault_id_unique").on(
      table.chainId,
      table.receiptTokenAddress,
      table.vaultId,
    ),
    foreignKey({
      columns: [table.chainId, table.factoryAddress, table.pairId],
      foreignColumns: [pairs.chainId, pairs.factoryAddress, pairs.id],
      name: "pair_fk",
    }),
    index("bonds_issuer_idx").on(table.issuer),
    index("bonds_vault_state_idx").on(table.vaultState),
    index("bonds_trading_ends_at_idx").on(table.tradingEndsAt),
    index("bonds_is_complete_idx").on(table.isComplete),
    index("bonds_chain_vault_idx").on(table.chainId, table.vaultAddress),
  ],
)

export const pairs = pgTable(
  "pairs",
  {
    id: integer("id").notNull(),
    chainId: integer("chain_id").notNull(),
    factoryAddress: char("factory_address", { length: 42 }).notNull(),
    stableTokenAddress: char("stable_token_address", { length: 42 }),
    vaultTokenAddress: char("vault_token_address", { length: 42 }),
    wrappedNativeTokenAddress: char("wrapped_native_token_address", { length: 42 }),
    routerAddress: char("router_address", { length: 42 }),
    tokenPairAddress: char("token_pair_address", { length: 42 }),
    version: integer("version"),
    routerV2Address: char("router_v2_address", { length: 42 }),
    pairAddress: char("pair_address", { length: 42 }),
    concentrated: boolean("concentrated"),
    chainlinkPriceOracleAddress: char("chainlink_price_oracle_address", { length: 42 }),
  },
  (table) => [primaryKey({ columns: [table.chainId, table.factoryAddress, table.id] })],
)

export const tokens = pgTable(
  "tokens",
  {
    address: char("address", { length: 42 }).notNull(),
    chainId: integer("chain_id").notNull(),
    symbol: varchar("symbol", { length: 8 }).notNull(),
    name: varchar("name", { length: 40 }).notNull(),
    decimals: integer("decimals").notNull(),
  },
  (table) => [primaryKey({ columns: [table.chainId, table.address] })],
)

export const trades = pgTable(
  "trades",
  {
    chainId: integer("chain_id").notNull(),
    txHash: char("tx_hash", { length: 66 }).notNull(),
    logIndex: integer("log_index").notNull(),
    blockNumber: integer("block_number").notNull(),
    blockTimestamp: timestamp("block_timestamp", { precision: 0, withTimezone: true }).notNull(),
    vaultAddress: char("vault_address", { length: 42 }).notNull(),
    routerAddress: char("router_address", { length: 42 }).notNull(),
    tokenOut: char("token_out", { length: 42 }).notNull(),
    tokenIn: char("token_in", { length: 42 }).notNull(),
    amountOut: numeric("amount_out", { precision: 78, scale: 0, mode: "bigint" }).notNull(),
    amountIn: numeric("amount_in", { precision: 78, scale: 0, mode: "bigint" }).notNull(),
    tokenInBalance: numeric("token_in_balance", {
      precision: 78,
      scale: 0,
      mode: "bigint",
    }).notNull(),
    tokenOutBalance: numeric("token_out_balance", {
      precision: 78,
      scale: 0,
      mode: "bigint",
    }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.chainId, table.txHash, table.logIndex] }),
    foreignKey({
      columns: [table.chainId, table.vaultAddress],
      foreignColumns: [bonds.chainId, bonds.vaultAddress],
      name: "trades_bond_fk",
    }),
    index("trades_vault_address_idx").on(table.vaultAddress),
    index("trades_chain_vault_idx").on(table.chainId, table.vaultAddress),
    index("trades_block_timestamp_idx").on(table.blockTimestamp),
  ],
)

export const tradeRequestStatusEnum = pgEnum("trade_request_status", [
  "created",
  "submitted",
  "pending",
  "retry",
  "executed",
  "failed",
  "rejected",
])

export const tradeRequests = pgTable(
  "trade_requests",
  {
    // Primary key
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),

    // Correlation keys
    clientOrderId: char("client_order_id", { length: 32 }).notNull(), // UUID4 without hyphens; primary correlation key from executor
    messageId: varchar("message_id", { length: 32 }), // PubSub message ID; kept for debugging/observability, not used for executor correlation

    // Order context
    chainId: integer("chain_id").notNull(),
    vaultAddress: char("vault_address", { length: 42 }).notNull(),
    side: varchar("side", { length: 4 }).notNull(), // "buy" or "sell"
    size: varchar("size", { length: 36 }).notNull(), // Decimal string as submitted

    // Status
    status: tradeRequestStatusEnum("status").notNull().default("created"),

    // Timestamps
    createdAt: timestamp("created_at", { precision: 3, withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { precision: 0, withTimezone: true }), // Order deadline; set after publish
    lastStatusAt: timestamp("last_status_at", { precision: 3, withTimezone: true }), // Updated on every executor message
    executedAt: timestamp("executed_at", { precision: 3, withTimezone: true }), // Set on successful execution

    // Execution result
    txHash: char("tx_hash", { length: 66 }), // Set on successful execution
    failureReason: text("failure_reason"), // Set on "rejected"/"failed" status; describes why the order could not be published
  },
  (table) => [
    unique("trade_requests_client_order_id_unique").on(table.clientOrderId),
    unique("trade_requests_message_id_unique").on(table.messageId),
    index("trade_requests_chain_vault_idx").on(table.chainId, table.vaultAddress),
    index("trade_requests_status_idx").on(table.status),
    index("trade_requests_created_at_idx").on(table.createdAt),
  ],
)

export const listings = pgTable(
  "listings",
  {
    chainId: integer("chain_id").notNull(),
    marketplaceAddress: char("marketplace_address", { length: 42 }).notNull(),
    listingId: integer("listing_id").notNull(),

    // Creation event details
    txHash: char("tx_hash", { length: 66 }).notNull(),
    blockNumber: integer("block_number").notNull(),
    blockTimestamp: timestamp("block_timestamp", { precision: 0, withTimezone: true }).notNull(),

    // Listing details
    receiptTokenAddress: char("receipt_token_address", { length: 42 }).notNull(),
    tokenId: integer("token_id").notNull(),
    status: listingStatusEnum("status").notNull().default("active"),
    seller: char("seller", { length: 42 }).notNull(),
    buyer: char("buyer", { length: 42 }),
    price: numeric("price", { precision: 78, scale: 0, mode: "bigint" }).notNull(),
    priceTokenAddress: char("price_token_address", { length: 42 }).notNull(),
    quantity: integer("quantity").notNull().default(1),

    // Settlement event details (cancelled or purchased)
    settledTxHash: char("settled_tx_hash", { length: 66 }),
    settledBlockNumber: integer("settled_block_number"),
    settledBlockTimestamp: timestamp("settled_block_timestamp", {
      precision: 0,
      withTimezone: true,
    }),
  },
  (table) => [
    primaryKey({ columns: [table.chainId, table.marketplaceAddress, table.listingId] }),
    foreignKey({
      columns: [table.chainId, table.receiptTokenAddress, table.tokenId],
      foreignColumns: [bonds.chainId, bonds.receiptTokenAddress, bonds.vaultId],
      name: "listings_bond_fk",
    }),
    index("listings_status_price_idx").on(table.status, table.price),
    index("listings_block_timestamp_idx").on(table.blockTimestamp),
    index("listings_seller_status_idx").on(table.seller, table.status),
    index("listings_receipt_token_idx").on(table.chainId, table.receiptTokenAddress, table.tokenId),
  ],
)

export const marketplaceTokenSets = pgTable(
  "marketplace_token_sets",
  {
    chainId: integer("chain_id").notNull(),
    marketplaceAddress: char("marketplace_address", { length: 42 }).notNull(),
    tokenSetId: integer("token_set_id").notNull(),
    receiptTokenAddress: char("receipt_token_address", { length: 42 }).notNull(),
    priceTokenAddress: char("price_token_address", { length: 42 }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.chainId, table.marketplaceAddress, table.tokenSetId] })],
)

export const receiptTokenBalances = pgTable(
  "receipt_token_balances",
  {
    chainId: integer("chain_id").notNull(),
    receiptTokenAddress: char("receipt_token_address", { length: 42 }).notNull(),
    tokenId: integer("token_id").notNull(),
    ownerAddress: char("owner_address", { length: 42 }).notNull(),
    balance: numeric("balance", { precision: 78, scale: 0, mode: "bigint" }).notNull(),
    lastUpdateBlockNumber: integer("last_update_block_number").notNull(),
    lastUpdateBlockTimestamp: timestamp("last_update_block_timestamp", {
      precision: 0,
      withTimezone: true,
    }).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.chainId, table.receiptTokenAddress, table.tokenId, table.ownerAddress],
    }),
    index("receipt_token_balances_owner_idx").on(table.ownerAddress, table.chainId),
    index("receipt_token_balances_token_idx").on(
      table.chainId,
      table.receiptTokenAddress,
      table.tokenId,
    ),
  ],
)

export const receiptTokenTransfers = pgTable(
  "receipt_token_transfers",
  {
    chainId: integer("chain_id").notNull(),
    txHash: char("tx_hash", { length: 66 }).notNull(),
    logIndex: integer("log_index").notNull(),
    blockNumber: integer("block_number").notNull(),
    blockTimestamp: timestamp("block_timestamp", { precision: 0, withTimezone: true }).notNull(),
    type: transferTypeEnum("type").notNull().default("transfer"),
    receiptTokenAddress: char("receipt_token_address", { length: 42 }).notNull(),
    tokenId: integer("token_id").notNull(),
    from: char("from", { length: 42 }).notNull(),
    to: char("to", { length: 42 }).notNull(),
    amount: numeric("amount", { precision: 78, scale: 0, mode: "bigint" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.chainId, table.txHash, table.logIndex, table.tokenId] }),
    index("receipt_token_transfers_token_idx").on(
      table.chainId,
      table.receiptTokenAddress,
      table.tokenId,
      table.blockTimestamp,
    ),
    index("receipt_token_transfers_from_idx").on(table.from, table.chainId),
    index("receipt_token_transfers_to_idx").on(table.to, table.chainId),
    index("receipt_token_transfers_type_idx").on(table.type),
  ],
)

export const feesCollected = pgTable(
  "fees_collected",
  {
    chainId: integer("chain_id").notNull(),
    txHash: char("tx_hash", { length: 66 }).notNull(),
    logIndex: integer("log_index").notNull(),
    blockNumber: integer("block_number").notNull(),
    blockTimestamp: timestamp("block_timestamp", { precision: 0, withTimezone: true }).notNull(),
    vaultAddress: char("vault_address", { length: 42 }).notNull(),
    recipientAddress: char("recipient_address", { length: 42 }).notNull(),
    tokenAddress: char("token_address", { length: 42 }).notNull(),
    amount: numeric("amount", { precision: 78, scale: 0, mode: "bigint" }).notNull(),
    // USD value assumes 6 decimal places (i.e., micro-dollars)
    usdValue: numeric("usd_value", { precision: 78, scale: 0, mode: "bigint" }),
  },
  (table) => [
    primaryKey({ columns: [table.chainId, table.txHash, table.logIndex] }),
    index("fees_collected_chain_vault_idx").on(table.chainId, table.vaultAddress),
    index("fees_collected_recipient_address_idx").on(table.recipientAddress),
    index("fees_collected_token_address_idx").on(table.tokenAddress),
    index("fees_collected_block_timestamp_idx").on(table.blockTimestamp),
  ],
)

export const tokenUsdPrice = pgTable(
  "token_usd_price",
  {
    chainId: integer("chain_id").notNull(),
    tokenAddress: char("token_address", { length: 42 }).notNull(),
    // USD value assumes 6 decimal places (i.e., micro-dollars)
    usdPrice: numeric("usd_price", { precision: 78, scale: 0, mode: "bigint" }).notNull(),
    oracleUpdatedAt: timestamp("oracle_updated_at", {
      withTimezone: true,
      precision: 0,
    }).notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      precision: 3,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.chainId, table.tokenAddress, table.oracleUpdatedAt] }),
    index("token_usd_price_latest").on(
      table.chainId,
      table.tokenAddress,
      desc(table.oracleUpdatedAt),
    ),
  ],
)

export const bondsRelations = relations(bonds, ({ one, many }) => ({
  pair: one(pairs, {
    fields: [bonds.chainId, bonds.factoryAddress, bonds.pairId],
    references: [pairs.chainId, pairs.factoryAddress, pairs.id],
  }),
  trades: many(trades),
  tradeRequests: many(tradeRequests),
  owners: many(receiptTokenBalances),
  transfers: many(receiptTokenTransfers),
  listings: many(listings),
}))

export const tradesRelations = relations(trades, ({ one }) => ({
  bond: one(bonds, {
    fields: [trades.chainId, trades.vaultAddress],
    references: [bonds.chainId, bonds.vaultAddress],
  }),
}))

export const listingsRelations = relations(listings, ({ one }) => ({
  bond: one(bonds, {
    fields: [listings.chainId, listings.receiptTokenAddress, listings.tokenId],
    references: [bonds.chainId, bonds.receiptTokenAddress, bonds.vaultId],
  }),
}))

export const receiptTokenBalancesRelations = relations(receiptTokenBalances, ({ one }) => ({
  bond: one(bonds, {
    fields: [
      receiptTokenBalances.chainId,
      receiptTokenBalances.receiptTokenAddress,
      receiptTokenBalances.tokenId,
    ],
    references: [bonds.chainId, bonds.receiptTokenAddress, bonds.vaultId],
  }),
}))

export const receiptTokenTransfersRelations = relations(receiptTokenTransfers, ({ one }) => ({
  bond: one(bonds, {
    fields: [
      receiptTokenTransfers.chainId,
      receiptTokenTransfers.receiptTokenAddress,
      receiptTokenTransfers.tokenId,
    ],
    references: [bonds.chainId, bonds.receiptTokenAddress, bonds.vaultId],
  }),
}))

export const feesCollectedRelations = relations(feesCollected, ({ one }) => ({
  bond: one(bonds, {
    fields: [feesCollected.chainId, feesCollected.vaultAddress],
    references: [bonds.chainId, bonds.vaultAddress],
  }),
}))

export const tradeRequestsRelations = relations(tradeRequests, ({ one }) => ({
  bond: one(bonds, {
    fields: [tradeRequests.chainId, tradeRequests.vaultAddress],
    references: [bonds.chainId, bonds.vaultAddress],
  }),
}))

export const tokenUsdPriceRelations = relations(tokenUsdPrice, ({ one }) => ({
  token: one(tokens, {
    fields: [tokenUsdPrice.chainId, tokenUsdPrice.tokenAddress],
    references: [tokens.chainId, tokens.address],
  }),
}))

export const schema = {
  intakeEvents,
  bonds,
  pairs,
  tokens,
  trades,
  tradeRequests,
  listings,
  marketplaceTokenSets,
  receiptTokenBalances,
  receiptTokenTransfers,
  feesCollected,
  tokenUsdPrice,
  bondsRelations,
  tradesRelations,
  tradeRequestsRelations,
  listingsRelations,
  receiptTokenBalancesRelations,
  receiptTokenTransfersRelations,
  feesCollectedRelations,
  tokenUsdPriceRelations,
}

export type Schema = typeof schema

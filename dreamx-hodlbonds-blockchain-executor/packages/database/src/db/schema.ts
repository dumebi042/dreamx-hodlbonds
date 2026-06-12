import {
  bigint,
  boolean,
  char,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  smallint,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core"

export const status = pgEnum("status", [
  "QUEUED",
  "EXECUTED",
  "EXECUTING",
  "EXCEPTION",
  "ERROR_RETRY",
  "ERROR_NO_RETRY",
])

export const logType = pgEnum("log_type", ["INSERTED", "UPDATED", "DELETED"])

export const executorRegion = pgEnum("executor_region", ["EU1", "US1"])

export const queue = pgTable(
  "queue",
  {
    id: serial().notNull(),
    status: status("status").notNull(),
    priority: smallint("priority").notNull(),
    earliest_try: timestamp("earliest_try"),
    latest_try: timestamp("latest_try"),
    should_retry: boolean("should_retry").notNull(),
    network: varchar("network", { length: 3 }).notNull(),
    executor: varchar("executor").notNull(),
    data: jsonb("data"),
    task_hash: char("task_hash", { length: 64 }).notNull(),
    status_message: varchar("status_message"),
    tx_hashes: char("tx_hashes", { length: 66 }).array(),
    attempts: integer("attempts").default(0),
    next_attempt: timestamp("next_attempt"),
    previous_attempt_region: executorRegion("previous_attempt_region"),
    gas_price: numeric("gas_price"),
    gas_usage: bigint("gas_usage", { mode: "bigint" }),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    index("ix_queue_network_status_priority_earliest_try").on(
      table.network,
      table.status,
      table.priority,
      table.earliest_try,
    ),
    uniqueIndex("ix_queue_task_hash_unique").on(table.task_hash),
  ],
)

export const queue_log = pgTable(
  "queue_log",
  {
    log_id: serial().notNull(),
    event_type: logType("event_type"),
    event_time: timestamp("event_time"),
    queue_id: integer("queue_id").notNull(),
    old_row: jsonb("old_row"),
    new_row: jsonb("new_row"),
  },
  (table) => [
    primaryKey({ columns: [table.log_id] }),
    index("ix_queue_log_queue_id").on(table.queue_id),
  ],
)

export const contracts = pgTable(
  "contracts",
  {
    id: serial().notNull(),
    network: char("network", { length: 3 }).notNull(),
    contract_name: varchar("contract_name").notNull(),
    address: char("address", { length: 42 }).notNull(),
    abi: jsonb("abi").notNull(),
    last_updated: timestamp("last_updated"),
  },
  (table) => [primaryKey({ columns: [table.network, table.contract_name] })],
)

export const schema = {
  status,
  logType,
  executorRegion,
  queue,
  queue_log,
  contracts,
}

export type Schema = typeof schema

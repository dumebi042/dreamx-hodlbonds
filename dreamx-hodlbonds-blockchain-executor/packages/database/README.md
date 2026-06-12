# @dreamx-development/hodlbonds-blockchain-executor-database

Database connection management and schema definitions for the HodlBonds Blockchain Executor system.

## Purpose

Provides Drizzle ORM schema definitions, database connection utilities, and migration tooling for PostgreSQL. Supports both simple connection strings and Google Cloud SQL with IAM authentication.

## Structure

```
src/
├── index.ts           # Connection utilities and exports
└── db/
    └── schema.ts      # Drizzle table schemas and enums

drizzle/
├── 0000_init.sql      # Initial schema migration
├── 0001_permissions.sql  # Role and permission setup
└── meta/              # Drizzle metadata
```

## Database Schema

### Tables

#### `queue`

Main task queue for blockchain execution.

**Key columns:**

- `id` - Serial primary key
- `status` - Task status (QUEUED, EXECUTING, EXECUTED, etc.)
- `priority` - Smallint priority value (higher = more urgent)
- `earliest_try` - Earliest allowed execution time
- `latest_try` - Latest allowed execution time
- `should_retry` - Whether task should retry on error
- `network` - Blockchain network (eth, ava, met, tst)
- `executor` - Executor type (DcaBot, DcaBotFixed, HodlBondsTrade)
- `data` - JSONB task data
- `task_hash` - SHA-256 hash for deduplication (unique)
- `tx_hashes` - Array of transaction hashes
- `attempts` - Number of execution attempts
- `next_attempt` - Timestamp for next retry
- `previous_attempt_region` - Region of last attempt (EU1, US1)
- `gas_price` - Recorded gas price
- `gas_usage` - Recorded gas usage

**Indexes:**

- Composite index on `network`, `status`, `priority`, `earliest_try` for efficient polling
- Unique index on `task_hash` for deduplication

#### `queue_log`

Audit trail for queue changes.

**Key columns:**

- `log_id` - Serial primary key
- `event_type` - Type of event (INSERTED, UPDATED, DELETED)
- `event_time` - Timestamp of event
- `queue_id` - Reference to queue table
- `old_row` - JSONB snapshot before change
- `new_row` - JSONB snapshot after change

#### `contracts`

Smart contract ABIs and addresses by network.

**Key columns:**

- `network` - Blockchain network (part of composite key)
- `contract_name` - Contract identifier (part of composite key)
- `address` - Contract address (42-char hex)
- `abi` - JSONB ABI definition
- `last_updated` - Timestamp of last update

### Enums

- **`status`** - Task statuses: QUEUED, EXECUTED, EXECUTING, EXCEPTION, ERROR_RETRY, ERROR_NO_RETRY
- **`log_type`** - Audit event types: INSERTED, UPDATED, DELETED
- **`executor_region`** - Deployment regions: EU1, US1

## Key Exports

### Connection Functions

```typescript
import {
  createDb,
  createDbWithConnectionDetails,
} from "@dreamx-development/hodlbonds-blockchain-executor-database"

// Simple connection with connection string
const db = createDb("postgresql://user:pass@localhost:5432/dbname")

// Cloud SQL with IAM authentication
const db = await createDbWithConnectionDetails({
  user: "service-account@project.iam",
  instanceId: "project:region:instance",
  database: "blockchain_executor_stage",
})
```

### Schema Exports

```typescript
import { schema, type Db } from "@dreamx-development/hodlbonds-blockchain-executor-database"

// Access table definitions
const { queue, queue_log, contracts } = schema

// Type-safe database client
const db: Db = createDb(connectionString)
```

## Usage

### Querying the Database

```typescript
import { createDb, schema } from "@dreamx-development/hodlbonds-blockchain-executor-database"
import { eq } from "drizzle-orm"

const db = createDb(process.env.DATABASE_URL!)

// Query tasks
const tasks = await db.select().from(schema.queue).where(eq(schema.queue.status, "QUEUED"))

// Insert a task
await db.insert(schema.queue).values({
  status: "QUEUED",
  priority: 5,
  network: "eth",
  executor: "DcaBot",
  data: {
    /* ... */
  },
  task_hash: "abc123...",
  should_retry: true,
})
```

### Cloud SQL Connection (Production)

```typescript
import { createDbWithConnectionDetails } from "@dreamx-development/hodlbonds-blockchain-executor-database"

const db = await createDbWithConnectionDetails({
  user: "hodlbonds-executor@my-project.iam",
  instanceId: "my-project:us-central1:blockchain-executor-db",
  database: "blockchain_executor_main",
})

// Connection uses IAM authentication - no password needed!
```

## Development

### Start Local Database

```bash
# From repository root
pnpm db:start
```

This starts a PostgreSQL container via Docker Compose on port 5432.

### Run Migrations

```bash
# From repository root
pnpm migrate

# Or from this package
pnpm --filter @dreamx-development/hodlbonds-blockchain-executor-database drizzle-kit migrate
```

### Generate New Migration

```bash
cd packages/database
pnpm drizzle-kit generate
```

### Reset Database

```bash
# From repository root - destroys and recreates database
pnpm db:reset
```

### View Database Logs

```bash
# From repository root
pnpm db:logs
```

## Configuration

### Local Development

Create a `.env` file in the repository root:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/blockchain_executor
```

### Production

Environment variables are set in deployment configurations:

- `DB_USER` - IAM service account email
- `DB_INSTANCE_ID` - Cloud SQL instance connection name
- `DB_NAME` - Database name (blockchain_executor_stage or blockchain_executor_main)

## Migrations

Migrations are SQL files in the `drizzle/` directory:

- **`0000_init.sql`** - Creates initial schema (tables, enums, indexes)
- **`0001_permissions.sql`** - Sets up database roles and permissions

Drizzle Kit tracks applied migrations in the `drizzle.__drizzle_migrations` table.

## Dependencies

- **drizzle-orm** - TypeScript ORM
- **drizzle-kit** - Migration tooling
- **@google-cloud/cloud-sql-connector** - Cloud SQL IAM authentication
- **pg** - PostgreSQL client

## Used By

- `@hodlbonds-blockchain-executor/intake` - For inserting tasks
- `@hodlbonds-blockchain-executor/executor` - For polling and updating tasks

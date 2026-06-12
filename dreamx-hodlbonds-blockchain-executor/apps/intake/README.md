# @hodlbonds-blockchain-executor/intake

Serverless Google Cloud Function that receives Pub/Sub messages and inserts tasks into the database queue.

## Purpose

The intake function acts as the entry point for the executor system. It receives CloudEvents from Pub/Sub topics, validates and parses message data, handles deduplication, and inserts tasks into the PostgreSQL queue for execution.

## Structure

```
src/
├── index.ts              # Cloud Function entry point and handler
├── Intake.ts             # Main processing logic
├── MessageFactory.ts     # Creates typed Message instances
├── config/               # Configuration utilities
├── database/             # Database connection setup
└── utils/
    └── canonical.ts      # Task hash computation for deduplication
```

## Key Components

### Cloud Function Handler

Entry point for CloudEvents triggered by Pub/Sub.

**Responsibilities:**

- Configure structured logging for GCP
- Initialize database connection on cold start
- Parse base64-encoded Pub/Sub message data
- Delegate to Intake class for processing
- Handle errors and log outcomes

### Intake

Main processing class that inserts tasks into the database.

**Responsibilities:**

- Validate and parse message data with Zod schemas
- Compute task hash for deduplication (SHA-256 of canonical message representation)
- Insert tasks into queue table with QUEUED status
- Handle duplicate detection via unique constraint on `task_hash`
- Detailed logging for tracking and debugging

**Deduplication:**

- Computes SHA-256 hash from canonical JSON representation of message
- Database unique constraint on `task_hash` prevents duplicates
- On conflict, checks if existing task matches exactly (detailed validation)

### MessageFactory

Creates typed Message instances based on executor type.

**Supported types:**

- `DcaBot` → `DcaBotMessage`
- `DcaBotFixed` → `DcaBotFixedMessage`
- `HodlBondsTrade` → `HodlBondsTradeMessage`
- Fallback → Base `Message`

## Configuration

### Environment Variables

Set by Cloud Build during deployment:

- **`EXECUTOR`** - Executor type (DcaBot, DcaBotFixed, HodlBondsTrade)
- **`BRANCH`** - Branch name (stage or main)
- **`LOG_LEVEL`** - Logging level (debug, info, warn, error)
- **`NODE_ENV`** - Environment mode (development or production)

### Database Configuration

Cloud Functions Gen2 connects to Cloud SQL via:

- **`DB_USER`** - IAM service account email (e.g., `hodlbonds-intake@project.iam`)
- **`DB_INSTANCE_ID`** - Cloud SQL connection name (e.g., `project:region:instance`)
- **`DB_NAME`** - Database name (`blockchain_executor_stage` or `blockchain_executor_main`)

Connection uses:

- IAM authentication (no password)
- Unix socket at `/cloudsql/INSTANCE_CONNECTION_NAME`
- Configured via `--add-cloudsql-instances` flag

## Features

### Task Deduplication

Prevents duplicate task insertion using cryptographic hashing:

1. Compute SHA-256 hash of canonical JSON representation
2. Include hash as `task_hash` in database insert
3. Unique constraint on `task_hash` prevents duplicates
4. On conflict, verify existing task matches exactly

**Canonical representation:**

- Sorted JSON keys
- Consistent whitespace
- Deterministic serialization

### Type-Safe Message Parsing

All incoming messages validated with Zod schemas:

```typescript
const message = this.messageFactory.createMessage(json)
// Returns typed DcaBotMessage, DcaBotFixedMessage, etc.
```

### Structured Logging

Logs formatted for GCP Cloud Logging:

- Severity mapping (TRACE → DEBUG, FATAL → CRITICAL)
- Labels for filtering (service, component, executor, branch)
- Message ID tracking for correlation
- Task ID logging after successful insert

### Automatic Retries

Cloud Functions automatically retries failed invocations:

- Exponential backoff
- Maximum retry attempts configurable in Pub/Sub subscription
- Idempotent due to deduplication

## Development

### Local Setup

1. **Start database:**

```bash
pnpm db:start
```

2. **Run migrations:**

```bash
pnpm migrate
```

3. **Set environment variables:**

```bash
export EXECUTOR=DcaBot
export BRANCH=dev
export LOG_LEVEL=debug
export NODE_ENV=development
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/blockchain_executor
```

4. **Run in development mode:**

```bash
pnpm --filter @hodlbonds-blockchain-executor/intake dev
```

### Commands

```bash
# Development mode (watch and reload)
pnpm --filter @hodlbonds-blockchain-executor/intake dev

# Build
pnpm --filter @hodlbonds-blockchain-executor/intake build

# Run production build
pnpm --filter @hodlbonds-blockchain-executor/intake start

# Test with coverage
pnpm --filter @hodlbonds-blockchain-executor/intake test

# Generate Cloud Build config from template
pnpm --filter @hodlbonds-blockchain-executor/intake prepare-cloudbuild-template
```

## Deployment

The intake function is deployed as Google Cloud Functions Gen2 with automatic CI/CD via Cloud Build.

### Architecture

- **Trigger**: Pub/Sub topic (one function per executor type)
- **Runtime**: Node.js 24
- **Deployment**: Cloud Build on `stage`/`main` branch pushes
- **Scaling**: Auto-scaling based on message volume
- **Authentication**: IAM-based database access (no passwords)

### Naming Convention

Functions follow the pattern: `{branch}-intake-{ExecutorType}`

**Examples:**

- `stage-intake-DcaBot` - Stage environment, DCA bot
- `main-intake-HodlBondsTrade` - Production environment, trades
- `stage-intake-DcaBotFixed` - Stage environment, fixed DCA

### Pub/Sub Topics

Each function is triggered by a dedicated topic matching its name:

- `stage-intake-DcaBot` topic → `stage-intake-DcaBot` function
- `main-intake-HodlBondsTrade` topic → `main-intake-HodlBondsTrade` function

### Deployment Guide

See [DEPLOYMENT.md](DEPLOYMENT.md) for complete instructions including:

- Cloud Build setup and triggers
- Service account configuration
- IAM database authentication setup
- Database role and permission configuration
- Pub/Sub topic creation
- Initial deployment steps
- Testing and monitoring
- Troubleshooting

### Cloud Build Template System

The intake app uses a template-based Cloud Build configuration:

1. **Edit template**: `cloudbuild-template.ejs`
2. **Generate config**: `pnpm prepare-cloudbuild-template`
3. **Commit**: Git commit the generated `cloudbuild.yaml`
4. **Deploy**: Push to `stage` or `main` branch

**Template features:**

- Dynamic function creation per executor type
- Automatic workspace dependency bundling via tarball packing
- Environment variable injection
- IAM policy configuration

### Quick Deploy

Push to the appropriate branch:

```bash
# Deploy to stage
git checkout stage
git push origin stage

# Deploy to production
git checkout main
git push origin main
```

Cloud Build automatically:

1. Installs dependencies
2. Builds the intake package
3. Deploys one function per executor type
4. Configures Pub/Sub triggers
5. Sets up IAM policies

## Testing

### Manual Testing

Publish a test message to the Pub/Sub topic:

```bash
gcloud pubsub topics publish stage-intake-DcaBot \
  --message='{
    "executor": "DcaBot",
    "network": "eth",
    "priority": 5,
    "earliestTry": 1234567890,
    "latestTry": 1234577890,
    "shouldRetry": true,
    "data": {
      "buyOrders": [
        {
          "amount": "1000000000000000000",
          "tokenAddress": "0x...",
          "minTokensOut": "100000000"
        }
      ]
    }
  }'
```

### View Logs

```bash
# Recent logs
gcloud functions logs read stage-intake-DcaBot --gen2 --region=us-central1

# Follow logs in real-time
gcloud functions logs read stage-intake-DcaBot --gen2 --region=us-central1 --stream

# Filter by severity
gcloud functions logs read stage-intake-DcaBot --gen2 --region=us-central1 --filter="severity>=ERROR"
```

## Dependencies

- **@dreamx-development/hodlbonds-blockchain-executor-database** - Database connection and schema
- **@dreamx-development/hodlbonds-blockchain-executor-dto** - Message types and validation
- **@google-cloud/functions-framework** - Cloud Functions runtime
- **log4js** - Structured logging
- **drizzle-orm** - Database queries

## Monitoring

### Metrics

Key metrics to monitor:

- Invocation rate (messages/second)
- Error rate and types
- Execution time (latency)
- Duplicate detection rate

### Logs

View logs in GCP Console:

```
Logging > Logs Explorer
resource.type="cloud_function"
resource.labels.function_name="stage-intake-DcaBot"
```

### Alerts

Consider setting up alerts for:

- High error rates
- Database connection failures
- Excessive execution time
- Duplicate insertion failures

## Error Handling

The intake function handles errors gracefully:

1. **Database errors**: Logged and thrown to trigger Pub/Sub retry
2. **Validation errors**: Logged with full message context
3. **Duplicate detection**: Verified and logged (not an error)
4. **Connection errors**: Automatic retry via Cloud Functions

**Idempotency:** Deduplication ensures safe retries without creating duplicate tasks.

## Adding New Executors

To add a new executor type:

1. **Edit the template**: `cloudbuild-template.ejs`
2. **Regenerate Cloud Build config**: `pnpm prepare-cloudbuild-template`
3. **Commit changes**: Git commit the updated `cloudbuild.yaml`
4. **Push to deploy**: Automatic deployment on `stage`/`main` branch push

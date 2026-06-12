# @hodlbonds-blockchain-executor/executor

Long-running service that polls the database for queued blockchain tasks and executes them on-chain.

## Purpose

The executor is a persistent containerized application that manages HD wallet pools, monitors the task queue, and submits transactions to blockchain networks. It handles retry logic, gas optimization, wallet refueling, and connection health monitoring.

## Structure

```
src/
├── index.ts                    # Application entry point and lifecycle
├── ExecutionManager.ts         # Task polling and lifecycle management
├── WalletManager.ts            # HD wallet pool and balance management
├── MerkleTreeManager.ts        # Merkle proof generation for wallet verification
├── ExecutorFactory.ts          # Routes tasks to executor implementations
├── ExecutorAbstract.ts         # Base class for executors
├── Wallet.ts                   # Individual wallet with nonce tracking
├── ExecutionResult.ts          # Standardized execution result
├── config/                     # Configuration utilities
├── database/                   # Database connection setup
├── implementations/            # Executor-specific logic
│   ├── DcaBot/                 # Dollar-cost averaging bot
│   │   ├── DcaBot.ts
│   │   └── DcaBotFixed.ts
│   └── HodlBondsTrade.ts       # DEX trade operations
├── schemas/                    # Zod validation schemas
└── utils/                      # Helper functions
```

## Key Components

### ExecutionManager

Polls the database for tasks and manages their lifecycle.

**Responsibilities:**

- Fetch tasks in QUEUED and ERROR_RETRY states
- Update task status with serializable isolation
- Calculate retry delays with exponential backoff
- Track executing tasks and release wallets
- Enforce region-based retry blocking

**Configuration:**

- `retryInitialWaitSeconds` - Initial retry delay
- `retryBackoffMultiplier` - Exponential backoff multiplier
- `pollIntervalSeconds` - Database polling frequency
- `maxDeadlineAfterErrorDays` - Maximum retry window

### WalletManager

Manages a pool of HD wallets derived from a seed phrase.

**Responsibilities:**

- Derive wallets from BIP-39 mnemonic with region-specific offsets
- Track wallet balances and nonce state
- Auto-refuel wallets from master wallet (wallet0)
- Monitor connection health and reconnect on failure
- Provide available wallets for transaction execution

**Configuration:**

- `walletCount` - Number of wallets in pool
- `totalGlobalWalletCount` - Total executor wallets across all regions (for merkle tree)
- `refuelThreshold` - Balance threshold to trigger refuel
- `refuelAmount` - Amount to send during refuel
- `providerEndpoint` - RPC endpoint (WebSocket preferred)

### MerkleTreeManager

Generates merkle proofs for executor wallet authorization on-chain.

**Responsibilities:**

- Build merkle tree from all global executor wallet addresses (across all regions)
- Generate merkle proofs for individual wallet addresses
- Verify proofs against the merkle root
- Normalize addresses to lowercase for consistent hashing

**Implementation:**

- Uses OpenZeppelin's `SimpleMerkleTree` for proof generation
- Leaves are `keccak256(address)` to match on-chain verification
- Tree includes ALL executor wallets globally, not just the regional subset
- Proofs are passed to smart contracts for wallet authorization

**Use case:**

Smart contracts store a single merkle root representing all authorized executor wallets. When an executor submits a transaction, it includes a merkle proof. The contract verifies the proof against the stored root to authorize the wallet, enabling on-chain permission management without storing every address.

### ExecutorFactory

Routes tasks to appropriate executor implementations based on executor type.

**Supported executors:**

- `DcaBot` - Dollar-cost averaging with multiple buy orders
- `DcaBotFixed` - Fixed-amount DCA variant
- `HodlBondsTrade` - DEX trade operations (Uniswap, LFJ, Blackhole)

### ExecutorAbstract

Base class providing common execution functionality.

**Features:**

- Contract loading from database
- EIP-1559 gas parameter calculation
- Transaction building and signing
- Transaction submission and monitoring
- Error handling and status updates

### Implementations

#### DcaBot / DcaBotFixed

Execute dollar-cost averaging strategies by processing buy orders sequentially.

#### HodlBondsTrade

Execute DEX trades using discriminated union pattern for operation types:

- **UniswapExactIn** - Uniswap V3 exact input swap
- **LFJExactIn** - Liquidity Flow Junction exact input swap
- **BlackholeExactIn** - Blackhole exact input swap

## Configuration

### Configuration Files

JSON files define executor behavior per chain and region.

**Location:**

- Local: `apps/executor/config/`
- Production: Google Cloud Parameter Manager

**Format:**

```json
{
  "serverName": "us-central1",
  "networkName": "eth-sepolia",
  "executorRegion": "US1",
  "database": {
    "user": "hodlbonds-executor@project.iam",
    "instanceId": "project:region:instance",
    "database": "blockchain_executor_stage"
  },
  "walletManager": {
    "walletCount": 10,
    "totalGlobalWalletCount": 20,
    "walletOffset": 0,
    "refuelThreshold": "100000000000000000",
    "refuelAmount": "500000000000000000",
    "providerEndpoint": "https://eth-sepolia.example.com"
  },
  "executionManager": {
    "retryInitialWaitSeconds": 60,
    "retryBackoffMultiplier": 2,
    "pollIntervalSeconds": 5,
    "maxDeadlineAfterErrorDays": 7
  }
}
```

**Region-specific differences:**

- `walletCount` - Number of wallets for this region (e.g., 10 for US1, 10 for EU1)
- `totalGlobalWalletCount` - Total wallets across ALL regions (e.g., 20 total, same value everywhere)
- `walletOffset` - Different per region to avoid wallet collision (US1: 1, EU1: 11)
- `executorRegion` - Region identifier (US1, EU1)
- `providerEndpoint` - Region-optimized RPC endpoint

### Environment Variables

- **`BLOCKCHAIN_EXECUTOR_CONFIG`** - Path to configuration JSON file
- **`SEED_PHRASE_SECRET`** - Name of the Secret Manager secret containing the BIP-39 mnemonic seed phrase
- **`GCP_PROJECT_ID`** - GCP project ID (for Secret Manager access)
- **`NODE_ENV`** - Environment mode (development or production)
- **`LOG_LEVEL`** - Logging level (debug, info, warn, error)

## Features

### Sophisticated Retry Logic

- Exponential backoff starting at configurable initial delay
- Region-based retry blocking prevents immediate retry from same region
- Maximum deadline enforcement (configurable days after first error)
- Separate status codes: ERROR_RETRY (retriable), ERROR_NO_RETRY (permanent), EXCEPTION (unexpected)

### Wallet Management

- HD wallet derivation from single seed phrase
- Region-specific offsets prevent wallet collision across deployments
- Merkle proof generation for on-chain wallet authorization
- Automatic balance monitoring and refueling
- Nonce tracking for concurrent transactions
- Connection health checks with auto-reconnection

### Gas Optimization

- EIP-1559 support with automatic maxFeePerGas and maxPriorityFeePerGas calculation
- Gas usage tracking and storage in database
- Fallback to legacy gas pricing for non-EIP-1559 chains

### Logging

- Structured JSON logs compatible with GCP Cloud Logging
- Severity mapping (TRACE → DEBUG, FATAL → CRITICAL)
- File-based logs with rotation (30-day retention)
- Per-component loggers for easy filtering

### Graceful Shutdown

- Handles SIGINT and SIGTERM signals
- Stops accepting new tasks
- Waits for in-flight transactions to complete
- Forced shutdown after configurable timeout (default 60s)

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

3. **Create config file:**

```bash
# Copy example config
cp apps/executor/config/example.json apps/executor/config/local.json

# Edit with your settings
```

4. **Set environment variables:**

```bash
export BLOCKCHAIN_EXECUTOR_CONFIG=apps/executor/config/local.json
export SEED_PHRASE_SECRET=seed-phrase-secret-name
export GCP_PROJECT_ID=your-project-id
export NODE_ENV=development
```

5. **Run in development mode:**

```bash
pnpm --filter @hodlbonds-blockchain-executor/executor dev
```

### Commands

```bash
# Development mode (watch and reload)
pnpm --filter @hodlbonds-blockchain-executor/executor dev

# Build
pnpm --filter @hodlbonds-blockchain-executor/executor build

# Run production build
pnpm --filter @hodlbonds-blockchain-executor/executor start

# Test with coverage
pnpm --filter @hodlbonds-blockchain-executor/executor test

# Type check
pnpm --filter @hodlbonds-blockchain-executor/executor type-check
```

## Deployment

The executor is deployed as Docker containers on Google Compute Engine VMs with multi-region support.

### Architecture

- **CI/CD**: Cloud Build automatically builds images on `stage`/`main` branch pushes
- **Images**: `gcr.io/PROJECT/blockchain-executor:stage` and `gcr.io/PROJECT/blockchain-executor:main`
- **Orchestration**: Docker Compose with base, stage, and main configurations
- **Regions**: US1 (us-central1) and EU1 (europe-west1)
- **Environments**: Stage (testnets) and main (mainnets) run side-by-side on same VM

### Deployment Guide

See [deployment/DEPLOYMENT.md](deployment/DEPLOYMENT.md) for complete instructions including:

- Cloud Build setup and triggers
- GCP infrastructure setup (Cloud SQL, GCE, service accounts)
- Configuration management (Parameter Manager)
- Secret management (Secret Manager)
- Initial deployment steps
- Daily operations (deploy updates, view logs, restart)
- Troubleshooting

### Quick Deploy

On a configured GCE instance:

```bash
cd /opt/blockchain-executor-deployment

# Pull latest images
docker-compose -f docker-compose.base.yml -f docker-compose.stage.yml -f docker-compose.main.yml pull

# Restart with new images
docker-compose -f docker-compose.base.yml -f docker-compose.stage.yml -f docker-compose.main.yml up -d

# View logs
docker-compose -f docker-compose.base.yml -f docker-compose.stage.yml -f docker-compose.main.yml logs -f
```

## Dependencies

- **@dreamx-development/hodlbonds-blockchain-executor-database** - Database connection and schema
- **@dreamx-development/hodlbonds-blockchain-executor-dto** - Message types and validation
- **ethers** - Ethereum library for wallet and transaction management
- **log4js** - Structured logging
- **drizzle-orm** - Database queries
- **dotenv** - Environment variable loading

## Monitoring

### Logs

Executors write structured JSON logs viewable in GCP Cloud Logging:

```bash
# View logs in GCP Console
# Logging > Logs Explorer

# Or via gcloud
gcloud logging read "resource.type=gce_instance AND jsonPayload.serverName=us-central1" --limit 50
```

### Metrics

Key metrics to monitor:

- Task processing rate
- Task success/failure ratios
- Wallet balances
- Gas prices and usage
- Connection health

### Alerts

Consider setting up alerts for:

- Low wallet balances
- High error rates
- Connection failures
- Excessive retry counts

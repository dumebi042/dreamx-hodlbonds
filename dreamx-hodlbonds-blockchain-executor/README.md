# @hodlbonds-blockchain-executor

A cloud-native TypeScript monorepo for scheduling and executing blockchain transactions on Google Cloud Platform. Messages submitted via Pub/Sub are processed into database tasks and executed on-chain by managed HD wallets.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Packages](#packages)
- [Apps](#apps)
- [Technology Stack](#technology-stack)
- [Getting Started](#getting-started)
- [Common Commands](#common-commands)
- [Publishing Packages](#publishing-packages)
- [Deployment](#deployment)

## Overview

The HodlBonds Blockchain Executor is a distributed system that enables reliable, scheduled blockchain transaction execution across multiple chains and regions. The system uses a dual deployment model:

- **Intake** (serverless): Google Cloud Functions that receive Pub/Sub messages and insert tasks into a PostgreSQL queue
- **Executor** (persistent): Long-running Docker containers on GCE that poll the database, manage wallets, and submit transactions on-chain

### How It Works

```
External Service
       │
       ├─> Publishes Message (via Client)
       │
       ▼
Google Pub/Sub Topic
       │
       ├─> Triggers CloudEvent
       │
       ▼
Intake Cloud Function
       │
       ├─> Validates & Inserts Task
       │
       ▼
PostgreSQL Database (Cloud SQL)
       │
       ├─> Polls for QUEUED Tasks
       │
       ▼
Executor Container (GCE)
       │
       ├─> Loads Wallet & Contract
       ├─> Builds & Signs Transaction
       ├─> Submits to Blockchain
       │
       ▼
Blockchain Network (Ethereum, Avalanche, etc.)
```

### Key Features

- **Multi-region support**: US and EU deployments with region-specific wallet pools
- **Sophisticated retry logic**: Exponential backoff with region-based retry blocking
- **HD wallet management**: Automatic derivation, nonce tracking, and balance refueling
- **Merkle proof wallet verification**: On-chain authorization using merkle tree proofs for executor wallet addresses
- **Type-safe messages**: Discriminated unions with Zod validation
- **Database-driven contracts**: Contract ABIs and addresses stored in PostgreSQL
- **Dual environments**: Separate stage (testnet) and main (mainnet) deployments

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Google Cloud Platform                   │
│                                                             │
│  ┌──────────────┐         ┌─────────────────┐              │
│  │   Pub/Sub    │────────>│ Intake Function │              │
│  │   Topics     │ trigger │   (Gen2 CF)     │              │
│  └──────────────┘         └────────┬────────┘              │
│                                    │                        │
│                                    │ INSERT task            │
│                                    ▼                        │
│                          ┌──────────────────┐               │
│                          │   Cloud SQL      │               │
│                          │  (PostgreSQL)    │               │
│                          │                  │               │
│  ┌──────────────┐        │  - queue         │               │
│  │ GCE VM (US1) │◄───────│  - queue_log     │               │
│  │              │ poll   │  - contracts     │               │
│  │ Executor     │        │                  │               │
│  │ Containers   │        └──────────────────┘               │
│  └──────────────┘                 ▲                         │
│                                   │                         │
│  ┌──────────────┐                 │                         │
│  │ GCE VM (EU1) │─────────────────┘                         │
│  │              │ poll                                      │
│  │ Executor     │                                           │
│  │ Containers   │                                           │
│  └──────────────┘                                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                        │
                        ├─> Submits Transactions
                        ▼
              Blockchain Networks
              (Ethereum, Avalanche, Metis, etc.)
```

## Packages

The monorepo includes three shared packages that provide common functionality for the apps.

### [@dreamx-development/hodlbonds-blockchain-executor-dto](packages/dto)

**Data Transfer Objects and type definitions**

Provides base classes, enums, and Zod schemas for all message types in the system.

**Key Exports:**

- `Message` - Base message class with validation
- `ExecutionResult` - Standardized execution result object
- Executor types: `DcaBotMessage`, `DcaBotFixedMessage`, `HodlBondsTradeMessage`
- Enums: `ExecutorType`, `Priority`, `QueueStatus`
- Validation schemas for runtime type checking

**Use Cases:**

- Creating type-safe messages for Pub/Sub submission
- Validating incoming CloudEvent data in intake functions
- Parsing task data in executor implementations

**Commands:**

```bash
pnpm --filter @dreamx-development/hodlbonds-blockchain-executor-dto build
pnpm --filter @dreamx-development/hodlbonds-blockchain-executor-dto test
```

### [@dreamx-development/hodlbonds-blockchain-executor-database](packages/database)

**Database connection and schema management**

Provides Drizzle ORM schema definitions, Cloud SQL connector integration, and migration tooling.

**Key Exports:**

- `getDbConnection()` - Simple database connection
- `getCloudSqlConnection()` - Cloud SQL connector with IAM auth
- `queue`, `queueLog`, `contracts` - Drizzle table schemas
- Database types and enums

**Schema Tables:**

- `queue` - Main task queue with status tracking
- `queue_log` - Audit trail for queue changes
- `contracts` - Smart contract ABIs and addresses by network

**Commands:**

```bash
# Start local PostgreSQL database
pnpm db:start

# Run migrations
pnpm migrate

# Stop database
pnpm db:stop

# Reset database (destroy and recreate)
pnpm db:reset
```

### [@dreamx-development/hodlbonds-blockchain-executor-client](packages/client)

**Client library for publishing messages to Pub/Sub**

Simplifies message submission by providing typed clients for different executor types.

**Key Exports:**

- `BlockchainExecutorClient` - Base client for publishing any message
- `HodlBondsTradeClient` - Specialized client for trade operations

**Use Cases:**

- External services submitting tasks to the executor system
- Programmatic task scheduling
- Integration testing with message submission

**Commands:**

```bash
pnpm --filter @dreamx-development/hodlbonds-blockchain-executor-client build
pnpm --filter @dreamx-development/hodlbonds-blockchain-executor-client test
```

## Apps

The monorepo includes two applications with distinct deployment models.

### [@hodlbonds-blockchain-executor/executor](apps/executor)

**Long-running service for on-chain task execution**

Polls the database for queued tasks, manages HD wallet pools, and submits transactions to blockchain networks.

**Key Components:**

- `ExecutionManager` - Task polling, retry logic, lifecycle management
- `WalletManager` - HD wallet derivation, balance monitoring, auto-refueling
- `MerkleTreeManager` - Merkle proof generation for executor wallet authorization
- `ExecutorFactory` - Routes tasks to appropriate executor implementation
- `ExecutorAbstract` - Base class with gas calculation and transaction submission
- Implementations: `DcaBot`, `DcaBotFixed`, `HodlBondsTrade`

**Features:**

- Serializable transaction isolation to prevent duplicate processing
- Exponential backoff retry with region-based blocking
- Automatic wallet refueling from master wallet (wallet0)
- Merkle tree proof generation for on-chain wallet verification (using OpenZeppelin SimpleMerkleTree)
- Connection health monitoring with auto-reconnection
- Structured JSON logging for GCP Cloud Logging

**Deployment:**

- Docker containers on Google Compute Engine
- Multi-region (US1, EU1) with region-specific configs
- Shares Cloud SQL Proxy connection
- CI/CD via Cloud Build on `stage`/`main` branch pushes

**Commands:**

```bash
# Development mode
pnpm --filter @hodlbonds-blockchain-executor/executor dev

# Build
pnpm --filter @hodlbonds-blockchain-executor/executor build

# Run production build
pnpm --filter @hodlbonds-blockchain-executor/executor start

# Test with coverage
pnpm --filter @hodlbonds-blockchain-executor/executor test
```

**Configuration:**

- JSON files in `apps/executor/config/` for local development
- Parameter Manager for production configs (region-specific)
- Secret Manager for seed phrases

### [@hodlbonds-blockchain-executor/intake](apps/intake)

**Serverless function for message intake and task creation**

Receives CloudEvents from Pub/Sub, validates messages, and inserts tasks into the database queue.

**Key Components:**

- `Intake` - Main processing class with deduplication logic
- `MessageFactory` - Creates typed Message instances based on executor type

**Features:**

- Task deduplication via SHA-256 hash of canonical message representation
- Automatic Pub/Sub retry on failure
- Type-safe message parsing with Zod validation
- Structured logging for GCP

**Deployment:**

- Google Cloud Functions Gen2 (Cloud Run-based)
- One function per executor type and environment
- Triggered by Pub/Sub topics
- Auto-scaling based on message volume

**Commands:**

```bash
# Development mode
pnpm --filter @hodlbonds-blockchain-executor/intake dev

# Build
pnpm --filter @hodlbonds-blockchain-executor/intake build

# Generate Cloud Build config from template
pnpm --filter @hodlbonds-blockchain-executor/intake prepare-cloudbuild-template
```

**Deployment:**

- Automatic via Cloud Build on `stage`/`main` branch pushes
- Template-based Cloud Build configuration
- IAM database authentication (no passwords)

## Technology Stack

### Core

- **Language**: TypeScript with ES modules
- **Runtime**: Node.js 24+
- **Package Manager**: pnpm 10+ with workspaces
- **Build Tool**: tsdown (TypeScript bundler)
- **Testing**: Vitest with v8 coverage

### Cloud & Infrastructure

- **Cloud Platform**: Google Cloud Platform
- **Message Queue**: Google Cloud Pub/Sub
- **Database**: PostgreSQL via Cloud SQL
- **ORM**: Drizzle ORM with Drizzle Kit migrations
- **Functions**: Google Cloud Functions Framework (Gen2)
- **Containers**: Docker with Docker Compose
- **CI/CD**: Google Cloud Build
- **Logging**: log4js with GCP-structured JSON

### Blockchain

- **Library**: ethers.js v6
- **Networks**: Ethereum, Avalanche, Metis (mainnet and testnet variants)
- **Wallet**: HD wallets with BIP-39 mnemonic seeds

### Code Quality

- **Linting**: oxlint (Rust-based, fast)
- **Formatting**: oxfmt (Rust-based, fast)
- **Type Checking**: TypeScript strict mode
- **Validation**: Zod runtime schemas

## Getting Started

### Prerequisites

- Node.js 24+
- pnpm 10+
- Docker and Docker Compose (for local database)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd hodlbonds-blockchain-executor

# Install dependencies for all packages and apps
pnpm install
```

### Local Development Setup

1. **Start the local PostgreSQL database:**

```bash
pnpm db:start
```

2. **Run database migrations:**

```bash
pnpm migrate
```

3. **Build all packages:**

```bash
pnpm build:packages
```

4. **Run development servers:**

```bash
# Start all apps in development mode
pnpm dev

# Or run individual apps
pnpm --filter @hodlbonds-blockchain-executor/executor dev
pnpm --filter @hodlbonds-blockchain-executor/intake dev
```

### Running Tests

```bash
# Run all tests with coverage
pnpm test

# Run tests for a specific package
pnpm --filter @dreamx-development/hodlbonds-blockchain-executor-dto test
pnpm --filter @dreamx-development/hodlbonds-blockchain-executor-database test
pnpm --filter @hodlbonds-blockchain-executor/executor test
```

## Common Commands

### Building

```bash
# Build everything (packages + apps)
pnpm build

# Build only packages (in dependency order)
pnpm build:packages

# Build a specific package
pnpm --filter @dreamx-development/hodlbonds-blockchain-executor-dto build
```

### Code Quality

```bash
# Format all code
pnpm format

# Lint all code
pnpm lint

# Type check all code
pnpm type-check

# Run all quality checks (format, lint, type-check, test)
pnpm precommit
```

### Database Operations

```bash
# Start local PostgreSQL database
pnpm db:start

# Stop database
pnpm db:stop

# Reset database (destroy and recreate)
pnpm db:reset

# View database logs
pnpm db:logs

# Run migrations
pnpm migrate
```

### Testing

```bash
# Run all tests with coverage
pnpm test

# Run tests for a specific workspace
pnpm --filter <workspace-name> test

# Run tests in watch mode
pnpm --filter <workspace-name> test --watch
```

### Development

```bash
# Start local database and run all apps
pnpm dev

# Run a specific app in development mode
pnpm --filter @hodlbonds-blockchain-executor/executor dev
pnpm --filter @hodlbonds-blockchain-executor/intake dev
```

## Publishing Packages

The three shared packages (`dto`, `client`, `database`) are published to GitHub Packages for use in other private repositories within the organization.

### Prerequisites

**Local Publishing (Testing):**

- Create a GitHub Personal Access Token with `read:packages` and `write:packages` scopes
- Set environment variable: `export GITHUB_TOKEN=your_token_here`

**CI/CD Publishing (Automated):**

- No setup required - uses automatic `GITHUB_TOKEN` in GitHub Actions

### Publishing a New Version

1. **Bump all package versions:**

```bash
# Patch version (0.0.1 → 0.0.2)
pnpm version:patch

# Minor version (0.0.1 → 0.1.0)
pnpm version:minor

# Major version (0.0.1 → 1.0.0)
pnpm version:major
```

2. **Commit, tag, and push:**

```bash
git add .
git commit -m "chore: release v0.1.0"
git tag v0.1.0
git push --follow-tags
```

3. **Automated publishing:**

GitHub Actions automatically:

- Builds all packages
- Publishes to GitHub Packages (`@dreamx-development` scope)
- Makes packages available for installation

### Installing Published Packages

In consuming repositories, create `.npmrc`:

```npmrc
@dreamx-development:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

**Local Setup:**

1. **Create a GitHub Personal Access Token:**
   - Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
   - Click "Generate new token (classic)"
   - Give it a descriptive name (e.g., "npm packages - local dev")
   - Select scopes: `read:packages`
   - Click "Generate token"
   - **Copy the token immediately** (you won't see it again!)

2. **Set the environment variable:**

   Add to your shell profile (`~/.zshrc`, `~/.bashrc`, or `~/.profile`):

   ```bash
   export GITHUB_TOKEN=ghp_your_token_here
   ```

   Then reload:

   ```bash
   source ~/.zshrc  # or ~/.bashrc
   ```

   **Or** for one-time use in the current terminal:

   ```bash
   export GITHUB_TOKEN=ghp_your_token_here
   ```

3. **Verify the setup:**
   ```bash
   echo $GITHUB_TOKEN  # Should print your token
   pnpm install        # Should authenticate successfully
   ```

**Security Notes:**

- Never commit `.npmrc` with a real token to git
- Keep your PAT secure like a password
- Use a token with minimal scopes (`read:packages` only for consuming)
- Rotate tokens periodically

Then install:

```bash
pnpm add @dreamx-development/hodlbonds-blockchain-executor-dto
pnpm add @dreamx-development/hodlbonds-blockchain-executor-client
pnpm add @dreamx-development/hodlbonds-blockchain-executor-database
```

### Local Publishing (Testing)

For testing the publish process locally:

```bash
export GITHUB_TOKEN=your_token_here
pnpm build:packages
pnpm publish:packages
```

## Deployment

This monorepo includes two deployment workflows:

- **Executor**: Docker containers deployed to Google Compute Engine VMs in multiple regions. See [apps/executor/deployment/DEPLOYMENT.md](apps/executor/deployment/DEPLOYMENT.md) for detailed instructions.

- **Intake**: Serverless Cloud Functions (Gen2) deployed automatically via Cloud Build. See [apps/intake/DEPLOYMENT.md](apps/intake/DEPLOYMENT.md) for detailed instructions.

Both workflows use Cloud Build CI/CD with automatic deployments triggered by pushes to `stage` and `main` branches.

---

**License**: Proprietary  
**Maintained by**: DreamX Development

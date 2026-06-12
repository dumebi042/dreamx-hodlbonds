# @dreamx-development/hodlbonds-blockchain-executor-client

Client library for publishing messages to Google Cloud Pub/Sub for the HodlBonds Blockchain Executor system.

## Purpose

Provides type-safe client classes that simplify message submission to the executor system. External services use this package to schedule blockchain transactions without dealing with Pub/Sub directly.

## Structure

```
src/
├── index.ts                       # Package exports
├── BlockchainExecutorClient.ts    # Base client for any message type
├── clients/
│   └── HodlBondsTradeClient.ts    # Specialized client for trades
└── schemas/
    └── pubsub-topic-path.ts       # Validation for Pub/Sub topic paths
```

## Key Exports

### BlockchainExecutorClient

Base client for publishing any `Message` to Pub/Sub.

**Methods:**

- `publishMessage(message: Message): Promise<string>` - Publish a message, returns message ID

**Constructor:**

```typescript
new BlockchainExecutorClient(topic?: string)
```

- `topic` - Optional Pub/Sub topic path (format: `projects/PROJECT_ID/topics/TOPIC_NAME`)
- Falls back to `EXECUTOR_PUBSUB_TOPIC` environment variable
- Validates topic path format with Zod schema

### HodlBondsTradeClient

Specialized client for publishing trade operations (extends `BlockchainExecutorClient`).

**Methods:**

- `publishHodlBondsTradeUpdate(network: Network, data: HodlBondsTradeData): Promise<string>` - Publish trade message

**Features:**

- Automatically sets execution time window (24 hours)
- Sets high priority (100)
- Enables retry by default

## Usage

### Publishing Generic Messages

```typescript
import { BlockchainExecutorClient } from "@dreamx-development/hodlbonds-blockchain-executor-client"
import {
  DcaBotMessage,
  Executor,
  Network,
  Priority,
} from "@dreamx-development/hodlbonds-blockchain-executor-dto"

const client = new BlockchainExecutorClient("projects/my-project/topics/stage-intake-DcaBot")

const message = new DcaBotMessage({
  executor: Executor.DcaBot,
  network: Network.eth,
  priority: Priority.Medium,
  earliestTry: Math.floor(Date.now() / 1000),
  latestTry: Math.floor(Date.now() / 1000) + 3600, // 1 hour window
  shouldRetry: true,
  data: {
    buyOrders: [
      {
        amount: "1000000000000000000", // 1 ETH
        tokenAddress: "0x...",
        minTokensOut: "100000000",
      },
    ],
  },
})

const messageId = await client.publishMessage(message)
console.log(`Published message: ${messageId}`)
```

### Publishing Trades

```typescript
import { HodlBondsTradeClient } from "@dreamx-development/hodlbonds-blockchain-executor-client"
import { Network, HodlBondsTradeOp } from "@dreamx-development/hodlbonds-blockchain-executor-dto"

const client = new HodlBondsTradeClient("projects/my-project/topics/main-intake-HodlBondsTrade")

const messageId = await client.publishHodlBondsTradeUpdate(Network.eth, {
  op: HodlBondsTradeOp.UniswapExactIn,
  data: {
    amountIn: "1000000000000000000", // 1 ETH
    amountOutMinimum: "100000000",
    path: "0x...",
    recipient: "0x...",
  },
})
```

### Using Environment Variables

```typescript
// Set EXECUTOR_PUBSUB_TOPIC environment variable
process.env.EXECUTOR_PUBSUB_TOPIC = "projects/my-project/topics/stage-intake-DcaBot"

// Client automatically uses environment variable
const client = new BlockchainExecutorClient()
```

## Configuration

### Environment Variables

- **`EXECUTOR_PUBSUB_TOPIC`** - Default Pub/Sub topic path (format: `projects/PROJECT_ID/topics/TOPIC_NAME`)

### Topic Naming Convention

Topics follow the pattern: `{environment}-intake-{ExecutorType}`

**Examples:**

- `stage-intake-DcaBot` - Stage environment, DCA bot executor
- `main-intake-HodlBondsTrade` - Production environment, trade executor
- `stage-intake-DcaBotFixed` - Stage environment, fixed DCA executor

## Development

### Build

```bash
pnpm --filter @dreamx-development/hodlbonds-blockchain-executor-client build
```

### Test

```bash
pnpm --filter @dreamx-development/hodlbonds-blockchain-executor-client test
```

### Type Check

```bash
pnpm --filter @dreamx-development/hodlbonds-blockchain-executor-client type-check
```

## Features

### BigInt Serialization

The client automatically converts BigInt values to strings when publishing messages:

```typescript
const message = new DcaBotMessage({
  // ...
  data: {
    buyOrders: [{ amount: 1000000000000000000n }], // BigInt automatically stringified
  },
})
```

### Topic Path Validation

Topic paths are validated using Zod schemas to ensure correct format:

```typescript
// Valid
"projects/my-project/topics/stage-intake-DcaBot"

// Invalid - throws error
"invalid-topic-path"
```

## Dependencies

- **@google-cloud/pubsub** - Google Cloud Pub/Sub client
- **@dreamx-development/hodlbonds-blockchain-executor-dto** - Message types and enums
- **zod** - Schema validation

## Used By

External services that need to submit blockchain execution tasks to the system.

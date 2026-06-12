# @dreamx-development/hodlbonds-blockchain-executor-dto

Data Transfer Objects and type definitions for the HodlBonds Blockchain Executor system.

## Purpose

Provides shared type-safe message classes, enums, and Zod validation schemas used across all packages and applications in the monorepo. This package ensures consistent data structures and runtime validation for messages flowing through the system.

## Structure

```
src/
├── common.ts              # Core enums (Executor, Network, Status)
├── message.ts             # Base Message class
├── task.ts                # Base Task class
├── model/                 # Executor-specific implementations
│   ├── DcaBot.ts          # Dollar-cost averaging bot
│   ├── DcaBotFixed.ts     # Fixed-amount DCA variant
│   └── HodlBondsTrade.ts  # Trading operations (Uniswap, LFJ, Blackhole)
├── schemas/               # Zod validation schemas
│   ├── message-schema.ts  # Message parameter validation
│   └── task-schema.ts     # Task parameter validation
└── utils/
    └── test-utils.ts      # Error capture utilities for testing
```

## Key Exports

### Common Types

- **`Message`** - Base message class with validation
- **`Task`** - Base task class
- **`Executor`** - Enum of executor types (DcaBot, DcaBotFixed, HodlBondsTrade)
- **`Network`** - Enum of blockchain networks (eth, ava, met, tst)
- **`Status`** - Enum of queue statuses (QUEUED, EXECUTING, EXECUTED, ERROR_RETRY, etc.)

### Validation Schemas

- **`MessageParamsSchema`** - Zod schema for message parameters
- **`TaskParamsSchema`** - Zod schema for task parameters

### Executor-Specific Models

#### DcaBot

- `DcaBotMessage` - Message class for DCA bot
- `DcaBotTask` - Task class for DCA bot
- `DcaBotData` - Type for DCA bot data
- `DcaBotBuyOrder` - Type for individual buy orders

#### DcaBotFixed

- `DcaBotFixedMessage` - Message class for fixed-amount DCA
- `DcaBotFixedTask` - Task class for fixed-amount DCA
- `DcaBotFixedData` - Type for fixed DCA data
- `DcaBotFixedBuyOrder` - Type for individual buy orders

#### HodlBondsTrade

- `HodlBondsTradeMessage` - Message class for trades
- `HodlBondsTradeTask` - Task class for trades
- `HodlBondsTradeData` - Type for trade data
- `HodlBondsTradeOp` - Enum of operation types (UniswapExactIn, LFJExactIn, BlackholeExactIn)
- Operation-specific types: `UniswapExactInData`, `LFJExactInData`, `BlackholeExactInData`

### Test Utilities

- `captureError()` - Capture synchronous function errors for testing
- `captureErrorAsync()` - Capture async function errors for testing
- `captureZodError()` - Capture Zod validation errors
- `captureZodErrorAsync()` - Capture async Zod validation errors

## Usage

### Creating Messages

```typescript
import {
  DcaBotMessage,
  Executor,
  Network,
  Priority,
} from "@dreamx-development/hodlbonds-blockchain-executor-dto"

const message = new DcaBotMessage({
  executor: Executor.DcaBot,
  network: Network.eth,
  priority: Priority.Medium,
  data: {
    buyOrders: [
      {
        amount: "1000000000000000000", // 1 ETH in wei
        tokenAddress: "0x...",
        minTokensOut: "100000000",
      },
    ],
  },
})
```

### Validating with Schemas

```typescript
import { MessageParamsSchema } from "@dreamx-development/hodlbonds-blockchain-executor-dto"

const result = MessageParamsSchema.safeParse(data)
if (!result.success) {
  console.error("Validation failed:", result.error)
}
```

### Type Guards

```typescript
import { Message, Executor } from "@dreamx-development/hodlbonds-blockchain-executor-dto"

function processMessage(message: Message) {
  if (message.executor === Executor.DcaBot) {
    // TypeScript knows this is a DcaBotMessage
    const buyOrders = message.data.buyOrders
  }
}
```

## Development

### Build

```bash
pnpm --filter @dreamx-development/hodlbonds-blockchain-executor-dto build
```

### Test

```bash
pnpm --filter @dreamx-development/hodlbonds-blockchain-executor-dto test
```

### Type Check

```bash
pnpm --filter @dreamx-development/hodlbonds-blockchain-executor-dto type-check
```

## Dependencies

- **zod** - Runtime type validation
- **tsdown** - Build tool for bundling TypeScript

## Used By

- `@dreamx-development/hodlbonds-blockchain-executor-client` - For creating messages to publish
- `@hodlbonds-blockchain-executor/intake` - For validating incoming messages
- `@hodlbonds-blockchain-executor/executor` - For parsing task data and execution

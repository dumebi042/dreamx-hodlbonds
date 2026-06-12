# DreamX HODLBonds — Scope Confirmation & Repo Orientation

> **Target commit:** `c8cf89e38a3ec77941a04bd64cb173434ceffcf8`
> **Status:** Scope confirmation only — no vulnerability findings produced
> **Date:** 2026-06-12

---

## 1. Confirmed In-Scope Apps/Repos

| #   | Repo                                   | Branch | What's in scope                                                                                                                     |
| --- | -------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `dreamx-hodlbonds-api`                 | `Main` | **`apps/trading-api`** explicitly listed. Intake, price-oracle, server are part of same monorepo — see NEEDS SOURCE notes.          |
| 2   | `dreamx-hodlbonds-blockchain-executor` | `Main` | Full repo in scope. Includes `apps/executor` (GCE), `apps/intake` (GCF), packages `client`, `dto`, `database`.                      |
| 3   | `dreamx-hodl-bonds-contracts`          | —      | Not explicitly listed in bounty scope table. However, contract ABIs and on-chain interactions called by in-scope code ARE in scope. |

**NEEDS SOURCE:** The bounty scope says `apps/trading-api (single app only)` for the API monorepo. Whether `intake` and `price-oracle` apps are in scope needs triage team confirmation — they share the same DB schema and are deeply coupled.

---

## 2. App/Repo Map

```
dreamx-hodlbonds/
│
├── dreamx-hodlbonds-api/                          # [PARTIAL SCOPE] Hono monorepo
│   ├── apps/trading-api/       🟢 Order execution HTTP API (port 3001)
│   │   ├── src/index.ts                        # Hono server entry
│   │   ├── src/routers/v0/orders.ts             # Order CRUD + HMAC auth
│   │   ├── src/routers/v0/vaults.ts             # Vault read queries
│   │   ├── src/routers/v0/time.ts               # Server time
│   │   ├── src/routers/internal/order-status.ts # PubSub status callback (OIDC)
│   │   ├── src/middleware/auth.ts               # HMAC-SHA256 auth + replay protection
│   │   ├── src/middleware/validators.ts          # Request validation guards
│   │   ├── src/services/order.ts                # Order orchestration engine
│   │   ├── src/services/order-queries.ts        # Order read queries
│   │   ├── src/services/vault.ts                # On-chain vault data service
│   │   ├── src/services/vault-db.ts             # Single vault DB query
│   │   ├── src/services/vaults-db.ts            # Vault list DB query
│   │   ├── src/services/dex/                    # DEX adapters (LFJ, Blackhole, Uniswap V4)
│   │   │   ├── index.ts                         # DEX selection + routing
│   │   │   ├── blackhole.ts                     # Blackhole Swap adapter
│   │   │   ├── lfj.ts                           # LFJ (Trader Joe v2) adapter
│   │   │   ├── uniswap-v4.ts                    # Uniswap V4 adapter
│   │   │   ├── oracle.ts                        # Chainlink oracle quote validation
│   │   │   ├── utils.ts                         # MinAmountOut calc, Merkle proof gen
│   │   │   └── types.ts                         # DEX adapter types
│   │   ├── src/lib/pubsub-auth.ts               # OIDC token verification
│   │   ├── src/lib/blockchain-error-handler.ts  # Blockchain error mapping
│   │   ├── src/lib/token-cache.ts               # In-memory token cache
│   │   ├── src/lib/http-client.ts               # HTTP client
│   │   └── src/schemas/                         # Zod validation schemas
│   │
│   ├── apps/intake/            🔵 On-chain event ingestion via Alchemy webhooks
│   │   ├── src/index.ts                        # Hono server entry
│   │   ├── src/middleware/auth.ts               # HMAC auth (same pattern as trading-api)
│   │   ├── src/services/alchemy-webhook.ts      # Alchemy webhook handler
│   │   ├── src/lib/event-router.ts              # Log → decode → handle pipeline
│   │   ├── src/lib/event-decoder.ts             # ABI-aware log decoding
│   │   ├── src/lib/event-handlers.ts            # Event handler registry
│   │   ├── src/lib/ingest-transaction.ts        # Blockchain tx ingestion
│   │   ├── src/lib/signature-validation.ts      # Alchemy HMAC signature validation
│   │   ├── src/lib/replay.ts                    # Failed event replay
│   │   └── src/handlers/                        # 12 individual event handlers
│   │
│   ├── apps/price-oracle/      🔵 Chainlink price cron (Cloud Run Job)
│   │   ├── src/index.ts                        # One-shot script
│   │   ├── src/config.ts                       # Oracle address config
│   │   ├── src/fetch-prices.ts                 # Multicall to Chainlink oracles
│   │   └── src/record-prices.ts                # Upsert to token_usd_price
│   │
│   ├── apps/server/            🔵 Token metadata proxy (mock service)
│   │   └── src/routers/token-metadata.ts       # GET /token/{chainId}/{factory}/{id}
│   │
│   ├── packages/blockchain/    📦 Shared: viem clients, ABIs, contract instances
│   ├── packages/db/            📦 Shared: Drizzle ORM, Postgres schema
│   └── packages/config/        📦 Shared TS config
│
├── dreamx-hodlbonds-blockchain-executor/        # [IN SCOPE] TypeScript monorepo
│   ├── apps/executor/          🟢 GCE container: polls queue, signs+submits txns
│   │   ├── src/index.ts                        # Entry - WalletManager + ExecutionManager
│   │   ├── src/ExecutionManager.ts              # Task queue polling + dispatch
│   │   ├── src/ExecutorFactory.ts               # Routes tasks to implementations
│   │   ├── src/ExecutorAbstract.ts              # Base class: gas calc + txn submission
│   │   ├── src/WalletManager.ts                 # HD wallet derivation (BIP-39)
│   │   ├── src/Wallet.ts                        # Single wallet abstraction
│   │   ├── src/MerkleTreeManager.ts             # Merkle proof generation
│   │   └── src/implementations/
│   │       └── HodlBondsTrade.ts                # 🟢 KEY - executes swaps on-chain
│   │
│   ├── apps/intake/            🟢 GCF Gen2: PubSub consumer → DB queue
│   │   └── src/index.ts                        # CloudEvent handler
│   │
│   ├── packages/client/        📦 PubSub publisher library (used by trading-api)
│   ├── packages/dto/           📦 Shared types (HodlBondsTradeOp, Network)
│   └── packages/database/      📦 Executor's own DB schema + migrations
│
└── dreamx-hodl-bonds-contracts/                # [REFERENCE] Foundry/Forge
    ├── src/dualTokenVault/DualTokenVault.sol
    ├── src/dualTokenVaultFactory/DualTokenVaultFactory.sol
    ├── src/dex/blackhole/BlackholeSwap.sol
    ├── src/dex/lfj/LiquidityBookSwap.sol
    ├── src/marketplace/BondMarketplace.sol
    ├── src/marketplace/ERC1155MarketplaceBase.sol
    ├── src/lib/MerkleTreeHelper.sol
    └── src/paymentSplitter/PaymentSplitterUpgradeable.sol
```

---

## 3. Entry Points

### 3.1 API Routes — `trading-api`

| Method | Path                             | Auth            | File                                                              | Purpose                                                                         |
| ------ | -------------------------------- | --------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `POST` | `/v0/orders/{chainId}`           | **HMAC**        | `routers/v0/orders.ts:77` → `services/order.ts:169`               | Place buy/sell order. Validates, quotes via DEX, simulates, publishes to PubSub |
| `GET`  | `/v0/orders/{clientOrderId}`     | **HMAC**        | `routers/v0/orders.ts:117` → `services/order-queries.ts:14`       | Get single order status                                                         |
| `GET`  | `/v0/orders`                     | **HMAC**        | `routers/v0/orders.ts:148` → `services/order-queries.ts:38`       | List orders with filters                                                        |
| `GET`  | `/v0/vaults/{chainId}`           | **None** (ETag) | `routers/v0/vaults.ts:54` → `services/vaults-db.ts:30`            | List vaults by chain                                                            |
| `GET`  | `/v0/vaults/{chainId}/{address}` | **None** (ETag) | `routers/v0/vaults.ts:96` → `services/vault-db.ts:27`             | Single vault detail                                                             |
| `GET`  | `/v0/time`                       | **None**        | `routers/v0/time.ts:25`                                           | Server time                                                                     |
| `GET`  | `/health`                        | **None**        | `index.ts:77`                                                     | Health check (DB + token cache)                                                 |
| `POST` | `/internal/order-status`         | **OIDC**        | `routers/internal/order-status.ts:14` via `lib/pubsub-auth.ts:16` | Executor status callback via PubSub push                                        |

Global middleware applied to ALL routes: logger, secureHeaders, sanitizeHeaders, queryStringLimit (1024 chars), SQL injection guard, CORS, rate limiter (60/min + 10/sec burst). Rate limiter **skips** `/internal/*`.

### 3.2 API Routes — `intake`

| Method | Path                                                 | Auth             | File                                                                  | Purpose                                        |
| ------ | ---------------------------------------------------- | ---------------- | --------------------------------------------------------------------- | ---------------------------------------------- |
| `POST` | `/webhooks/alchemy/{chainId}`                        | **Alchemy HMAC** | `services/alchemy-webhook.ts:12` via `lib/signature-validation.ts:26` | Receive + validate + transform on-chain events |
| `GET`  | `/health`                                            | **None**         | `index.ts:22`                                                         | DB health check                                |
| `GET`  | `/admin/events/stats`                                | **HMAC**         | `index.ts:91`                                                         | Event processing stats                         |
| `POST` | `/admin/events/replay`                               | **HMAC**         | `index.ts:102`                                                        | Replay all failed events                       |
| `POST` | `/admin/events/replay/{chainId}/{txHash}/{logIndex}` | **HMAC**         | `index.ts:119`                                                        | Replay specific event                          |
| `POST` | `/admin/events/ingest/{chainId}/{txHash}`            | **HMAC**         | `index.ts:136`                                                        | Ingest transaction from blockchain             |

Supported chains for Alchemy webhooks: 43113 (Avalanche Fuji), 11155111 (Sepolia).

### 3.3 Background Jobs / Queue / PubSub

| Component                            | Trigger                                          | Description                                                                   |
| ------------------------------------ | ------------------------------------------------ | ----------------------------------------------------------------------------- |
| **`price-oracle`**                   | Cloud Run Job (cron)                             | Fetches Chainlink prices → upserts `token_usd_price`                          |
| **`executor GCE`**                   | Continuous loop (polls DB)                       | Polls queue → signs + submits blockchain transactions                         |
| **`executor-intake GCF`**            | PubSub event                                     | Receives `HodlBondsTradeMessage` → validates → inserts queue task             |
| **PubSub: EXECUTOR_PUBSUB_TOPIC**    | trading-api publishes via `HodlBondsTradeClient` | Sends trade orders (`LFJ_EXACT_IN`, `BLACKHOLE_EXACT_IN`, `UNISWAP_EXACT_IN`) |
| **PubSub: TRADING_API_STATUS_TOPIC** | executor publishes via `TradingApiClient`        | Sends status updates back to `/internal/order-status`                         |

### 3.4 Transaction Builder Flow (Order → Blockchain)

```
POST /v0/orders/{chainId}
  → HMAC validation
  → orderService():
      1. INSERT tradeRequests (status: "created", "onConflictDoNothing" dedup)
      2. Read vault data (DB → blockchain fallback if missing)
      3. Resolve DEX selections (primary + backup)
      4. Get quote from DEX adapter (Blackhole/LFJ/UniswapV4)
      5. Validate quote against Chainlink oracle (SKIPPED on testnets)
      6. Simulate swap on-chain (SKIPPED for Uniswap V4 - not implemented)
      7. Publish HodlBondsTradeMessage to executor PubSub
      8. UPDATE status → "submitted"
  → executor-intake GCF receives → validates → inserts queue task
  → executor GCE polls → HodlBondsTrade.execute():
      1. Generate Merkle proof for wallet address
      2. ethers signer.sendTransaction() to smart contract
      3. Publish status update back to trading-api
  → /internal/order-status receives → validates OIDC → checks terminal state → updates tradeRequests
```

### 3.5 Signing Flows

| Step                     | Key Material                                               | Where Stored                                | Used In                                  |
| ------------------------ | ---------------------------------------------------------- | ------------------------------------------- | ---------------------------------------- |
| Order API simulation     | `env.EXECUTOR_ADDRESSES[0]` (account for simulateContract) | Environment variable                        | `dex/blackhole.ts:207`, `dex/lfj.ts:182` |
| Executor wallet signing  | HD wallets from **BIP-39 seed phrase**                     | GCP Secret Manager (`executor-seed-phrase`) | `WalletManager.ts` → `HodlBondsTrade.ts` |
| Trading API HMAC signing | `API_KEYS` Map<UUID, string>                               | Environment variables                       | `middleware/auth.ts:53`                  |
| Alchemy webhook signing  | `ALCHEMY_SIGNING_KEYS` Record<string, string>              | Environment variables                       | `lib/signature-validation.ts:26`         |
| OIDC for PubSub          | Google IAM-managed service account                         | IAM                                         | `lib/pubsub-auth.ts:16`                  |
| Deploy script            | `env.PRIVATE_KEY`                                          | Environment variable                        | `scripts/deploy-dual-token-vault.ts:7`   |

---

## 4. Auth Model

### Authentication Methods

| Method                | Where                                          | Mechanism                                                                                                                                                   | Key Mgmt                                              |
| --------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **HMAC-SHA256**       | `trading-api` + `intake` auth middleware       | `X-Api-Key` + `X-Timestamp` + `X-Signature` over canonical string `method\npath\nbodyHash\ntimestamp`. Constant-time comparison with dummy secret fallback. | `env.API_KEYS` — Map in environment                   |
| **Replay protection** | Both HMAC middlewares                          | LRU cache of `keyId:timestamp` pairs with TTL = maxSkewMs \* 2                                                                                              | In-memory, per-instance (not shared across instances) |
| **OIDC token**        | `/internal/order-status`                       | Google OAuth2Client verifies ID token against `SERVICE_URL` audience + `PUBSUB_SERVICE_ACCOUNT_EMAIL`                                                       | Google IAM-managed                                    |
| **Alchemy HMAC**      | `/webhooks/alchemy/*`                          | HMAC-SHA256 hex digest over raw body, iterates multiple configured keys for match                                                                           | `env.ALCHEMY_SIGNING_KEYS`                            |
| **No auth**           | GET /v0/vaults/\*, /v0/time, /health, /v0/docs | —                                                                                                                                                           | Public                                                |

### Authorization Model

**No role-based authorization.** Any valid API key can:

- Place orders of any size
- List any orders
- Access admin endpoints in intake

Only distinction: authenticated (HMAC/OIDC) vs unauthenticated (public).

---

## 5. Secrets / Key Handling

| Secret                          | Storage                                       | Location                                    | Risk Level                                  |
| ------------------------------- | --------------------------------------------- | ------------------------------------------- | ------------------------------------------- |
| **BIP-39 seed phrase**          | GCP Secret Manager                            | Fetched at executor runtime via Secrets API | **CRITICAL** — controls all wallet keys     |
| **HD wallet private keys**      | Derived in-memory at runtime                  | `WalletManager.ts`                          | **CRITICAL** — ephemeral, derived from seed |
| **HMAC API keys**               | Environment variable (`API_KEYS` Map)         | docker-compose / Cloud Run config           | **HIGH** — plaintext in env config          |
| **Alchemy signing keys**        | Environment variable (`ALCHEMY_SIGNING_KEYS`) | Cloud Run config                            | **HIGH**                                    |
| **PRIVATE_KEY** (deploy script) | Environment variable                          | `deploy-dual-token-vault.ts:7`              | **HIGH** — raw private key                  |
| **Database credentials**        | IAM auth OR DATABASE_URL env var              | Cloud SQL config                            | **MEDIUM**                                  |
| **RPC API keys**                | Parameter Manager (GCP) or config             | Executor config                             | **MEDIUM**                                  |

**Notable:** No HSM or KMS is used for any key material. The executor uses GCP Secret Manager for the master seed phrase, but all derived wallet private keys are held in memory at runtime.

---

## 6. Database Schema Summary

### Shared DB (`packages/db/src/schema/index.ts`) — Postgres via Drizzle ORM

| Table                   | Primary Key                                             | Key Columns                                                                                                         | Description               |
| ----------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `intake_events`         | `(chainId, txHash, logIndex)`                           | `status` (pending/success/failed), `rawLog` (JSONB), `eventName`, `args`                                            | Raw on-chain event logs   |
| `bonds`                 | `id` (auto)                                             | `chainId`, `vaultAddress`, `vaultTokenAddress`, `stableTokenAddress`, `vaultState`, `isComplete` (generated column) | Bond/vault lifecycle data |
| `pairs`                 | `(chainId, factoryAddress, id)`                         | `routerAddress`, `tokenPairAddress`, `chainlinkPriceOracleAddress`                                                  | Approved DEX pairs        |
| `tokens`                | `(chainId, address)`                                    | `symbol`, `name`, `decimals`                                                                                        | Token metadata            |
| `trades`                | `(chainId, txHash, logIndex)`                           | `vaultAddress`, `amountIn`, `amountOut`                                                                             | Completed on-chain trades |
| `tradeRequests`         | `id` (auto)                                             | `clientOrderId` (unique), `messageId` (unique), `status`, `txHash`                                                  | Order lifecycle           |
| `listings`              | `(chainId, marketplaceAddress, listingId)`              | `seller`, `buyer`, `price`, `status`                                                                                | Marketplace listings      |
| `marketplaceTokenSets`  | `(chainId, marketplaceAddress, tokenSetId)`             | `receiptTokenAddress`, `priceTokenAddress`                                                                          | Token set configs         |
| `receiptTokenBalances`  | `(chainId, receiptTokenAddress, tokenId, ownerAddress)` | `balance`                                                                                                           | ERC1155 balances          |
| `receiptTokenTransfers` | `(chainId, txHash, logIndex, tokenId)`                  | `from`, `to`, `amount`, `type`                                                                                      | ERC1155 transfer history  |
| `feesCollected`         | `(chainId, txHash, logIndex)`                           | `vaultAddress`, `amount`, `usdValue`                                                                                | Protocol fee events       |
| `tokenUsdPrice`         | `(chainId, tokenAddress, oracleUpdatedAt)`              | `usdPrice` (6 decimals micro-dollars)                                                                               | USD price history         |

### Key Constraints

- `bonds_chain_vault_unique` on `(chainId, vaultAddress)` — one bond record per vault
- `trade_requests_client_order_id_unique` on `clientOrderId` — prevents duplicate orders
- `trade_requests_message_id_unique` on `messageId` — prevents duplicate PubSub processing
- `bonds.isComplete` is a **generated column** — `factory_address IS NOT NULL AND vault_state IS NOT NULL`

### Executor DB (separate Cloud SQL instance)

- `queue` — Task queue with status tracking, priority, deadlines
- `queue_log` — Audit trail for queue changes
- `contracts` — Contract ABIs and addresses by network

### On-Chain vs Off-Chain

| Data                                                    | Location                      | Source of Truth                        |
| ------------------------------------------------------- | ----------------------------- | -------------------------------------- |
| Vault config (bondPrice, reserveRatio, token addresses) | **On-chain**                  | Blockchain                             |
| Vault balances                                          | **On-chain**                  | Blockchain                             |
| Vault lifecycle state                                   | **On-chain**                  | Blockchain                             |
| Trade execution amounts                                 | **On-chain**                  | Blockchain                             |
| Order lifecycle status                                  | **Off-chain** (tradeRequests) | Database                               |
| Token metadata                                          | **Off-chain** (tokens)        | Database (seeded from config)          |
| DEX pair configs                                        | **Off-chain** (pairs)         | Database (populated by event handlers) |
| USD price history                                       | **Off-chain** (tokenUsdPrice) | Database (price oracle cron)           |

---

## 7. External Services / RPCs

| Service                           | Networks / Details                                                        | Used By                                   |
| --------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------- |
| **Avalanche C-Chain** (mainnet)   | Chain ID 43114                                                            | trading-api, price-oracle                 |
| **Avalanche Fuji** (testnet)      | Chain ID 43113 — `https://avalanche-fuji-c-chain-rpc.publicnode.com/`     | trading-api, intake, price-oracle         |
| **Ethereum Sepolia** (testnet)    | Chain ID 11155111 — `https://sepolia.drpc.org`                            | trading-api, intake                       |
| **Blackhole Swap**                | Algebra-integrated DEX on Avalanche                                       | `dex/blackhole.ts`                        |
| **LFJ (Liquidity Book)**          | Trader Joe v2-style DEX                                                   | `dex/lfj.ts`                              |
| **Uniswap V4**                    | Uniswap V4 pools on Avalanche                                             | `dex/uniswap-v4.ts`                       |
| **Chainlink Price Feeds**         | AVAX/USD, BTC/USD, ETH/USD on Avalanche mainnet; AVAX/USD on Fuji testnet | `dex/oracle.ts`, `price-oracle`           |
| **Google Cloud Pub/Sub**          | Cross-component messaging                                                 | trading-api, executor-intake, executor    |
| **Google Cloud Run**              | Hosting API containers                                                    | trading-api, intake, price-oracle, server |
| **Google Cloud Functions (Gen2)** | Serverless PubSub consumer                                                | executor-intake                           |
| **Google Compute Engine**         | Long-running Docker containers                                            | executor                                  |
| **Cloud SQL (PostgreSQL)**        | Main + executor databases                                                 | All apps                                  |
| **GCP Secret Manager**            | Seed phrase, topic refs                                                   | executor                                  |
| **GCP Parameter Manager**         | Blockchain configs (RPC, wallet offsets)                                  | executor                                  |
| **Alchemy**                       | On-chain event webhooks                                                   | intake                                    |
| **GitHub Packages**               | `@dreamx-development/hodlbonds-blockchain-executor-client` and `-dto`     | trading-api                               |

---

## 8. High-Risk Files / Functions to Audit First

### 🔴 Critical: Signing & Transaction Submission

| File                                             | Lines    | Risk                                                                                                                                      |
| ------------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `executor/src/WalletManager.ts`                  | —        | **HD wallet derivation** from BIP-39 seed phrase — single point of compromise for all wallet keys                                         |
| `executor/src/implementations/HodlBondsTrade.ts` | L84-L154 | **Direct contract calls** with user-supplied `quantity`, `minAmountOut`, `inputToken`, `deadline`, `merkleProof` from untrusted task data |
| `executor/src/ExecutorAbstract.ts`               | —        | **Gas estimation + transaction submission** base class — controls how all transactions are sent                                           |
| `trading-api/scripts/deploy-dual-token-vault.ts` | L7       | **`privateKeyToAccount(env.PRIVATE_KEY!)`** — raw private key in environment variable                                                     |

### 🔴 Critical: Order Execution

| File                                         | Lines     | Risk                                                                                                                                         |
| -------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `trading-api/src/services/order.ts`          | L169-L335 | **Full order flow**: DB reservation, DEX quote, oracle validation, swap simulation, PubSub publish. DEX primary/backup fallback at L281-L308 |
| `trading-api/src/services/order.ts`          | L180-L194 | **`onConflictDoNothing`** — order deduplication via clientOrderId                                                                            |
| `trading-api/src/services/order.ts`          | L204-L243 | **DB → blockchain fallback** — if bond not in DB, falls back to on-chain vaultService()                                                      |
| `trading-api/src/services/dex/blackhole.ts`  | L240-L258 | **`executeSwap()`** — constructs HodlBondsTradeData and publishes to executor PubSub                                                         |
| `trading-api/src/services/dex/lfj.ts`        | L215-L232 | **`executeSwap()`** — same pattern as Blackhole                                                                                              |
| `trading-api/src/services/dex/uniswap-v4.ts` | L133-L136 | **`simulateSwap` NOT IMPLEMENTED** — skips pre-execution validation                                                                          |
| `trading-api/src/services/dex/oracle.ts`     | L40-L103  | **Quote validation** — deviation check at L97 only enforced on **non-testnet** chains                                                        |
| `trading-api/src/services/dex/utils.ts`      | L22-L27   | **`calculateMinAmountOut()`** — slippage tolerance (25 bps) determines minimum acceptable output                                             |
| `trading-api/src/services/dex/utils.ts`      | L56-L68   | **`generateExecutorMerkleProof()`** — generates proofs for simulation using `env.EXECUTOR_ADDRESSES`                                         |
| `trading-api/src/services/vault.ts`          | L92-L108  | **`frozenBalance` calculation** — `startingVaultTokenBalance * reserveRatio / 10000`                                                         |

### 🔴 Critical: Authentication

| File                                               | Lines        | Risk                                                                                                                    |
| -------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `trading-api/src/middleware/auth.ts`               | L53-L122     | **HMAC authentication** — canonical string construction, replay cache (per-instance, not shared), dummy secret fallback |
| `intake/src/middleware/auth.ts`                    | L53-L122     | **Same HMAC pattern** as trading-api                                                                                    |
| `trading-api/src/lib/pubsub-auth.ts`               | L16          | **OIDC token verification** — validates ID token for status callbacks                                                   |
| `intake/src/lib/signature-validation.ts`           | L26-L39      | **Alchemy webhook multi-key HMAC** — iterates all keys until match                                                      |
| `trading-api/src/routers/internal/order-status.ts` | L77, L85-L91 | **Terminal state enforcement** + timestamp ordering for status updates                                                  |

### 🔴 High: Input Validation & Edge Cases

| File                                        | Lines     | Risk                                                                                                 |
| ------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------- |
| `trading-api/src/services/dex/blackhole.ts` | L220-L221 | **uint128 clamping** — `amountIn > 2^128-1 ? 2^128-1 : amountIn` — truncation risk for large amounts |
| `trading-api/src/middleware/validators.ts`  | L41-L71   | **SQL injection guard** — regex-based, defense-in-depth (Drizzle handles parameterization)           |
| `trading-api/src/middleware/validators.ts`  | L30       | **Query string limit** — 1024 chars by default                                                       |
| `intake/src/lib/event-router.ts`            | L94-L168  | **`Promise.allSettled` pipeline** — handler failures caught but webhook returns 200 even on failures |
| `intake/src/lib/event-decoder.ts`           | L46-L52   | **Log decoding** — uses combined ABI; unknown events return null (L64)                               |

---

## 9. Out-of-Scope / Kill List

| Item                                              | Reason                                                                            |
| ------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Low, Medium, High severity issues**             | Only **Critical** severity is eligible for rewards                                |
| **Theoretical issues without working PoC**        | "Reports without a fully working PoC are invalid"                                 |
| **Human-based errors**                            | Explicitly out of scope per program rules                                         |
| **Rogue privileged users**                        | Explicitly out of scope per program rules                                         |
| **Assumptions from other targets**                | "Do not use assumptions from other targets"                                       |
| **AI-generated reports without runnable PoC**     | Not accepted per program rules                                                    |
| **Web frontend / UI**                             | No frontend exists in scope                                                       |
| **DcaBot / DcaBotFixed executor implementations** | Not part of HODLBonds functionality — separate products                           |
| **Infrastructure-level misconfigurations**        | Deployment-specific (GCP IAM, Cloud SQL), not code-level                          |
| **Smart contracts repo directly**                 | Not explicitly listed in bounty scope table                                       |
| **server app (token-metadata)**                   | Uses mock service, no real blockchain interaction                                 |
| **Existing audit findings**                       | Prior Hacken audit (March 2026) findings excluded unless new exploit chains exist |

### Explicitly In-Scope (per bounty table)

1. `dreamx-hodlbonds-api` → **`apps/trading-api`** (single app only per "Assets in Scope")
2. `dreamx-hodlbonds-blockchain-executor` (full repo)
3. All supporting packages (`blockchain`, `db`, `client`, `dto`, `database`) that in-scope apps depend on

**NEEDS SOURCE:** `intake` and `price-oracle` apps share the same monorepo and DB schema as trading-api. Confirm with triage team whether they are explicitly in scope.

---

## 10. Attack Surface Summary

### Critical Trust Boundaries

```
HMAC Client ──► Trading API ──► PubSub ──► Executor Intake ──► Executor DB ──► Executor GCE ──► Blockchain
                                                                                      │
                                                                                      ▼
Alchemy ──► Intake API ──► PostgreSQL ◄──────────────────────────────────────── PubSub Status
```

1. **HMAC authentication** → trading-api — key management, replay window, canonical string construction
2. **Order validation** → DEX quoting + oracle validation — slippage, price manipulation, minAmountOut truncation
3. **Executor signing** → seed phrase management, wallet derivation, transaction construction with untrusted parameters
4. **PubSub message integrity** → OIDC verification, message replay, task deduplication
5. **Event ingestion** → Alchemy signature validation, event decoding, state updates from on-chain events
6. **Status update processing** → OIDC auth, terminal state checks, timestamp ordering

### Key Architectural Observations

1. **No KMS/HSM** — All signing keys derived from seed phrase in-memory; HMAC keys in plaintext env vars
2. **Simulation gap on Uniswap V4** — `simulateSwap` not implemented, orders go directly to execution
3. **Oracle validation gap on testnets** — Chainlink deviation check only enforced on mainnet
4. **Per-instance replay cache** — HMAC replay protection is not shared across instances
5. **`onConflictDoNothing` dedup** — Order deduplication relies on DB unique constraint behavior
6. **DB → blockchain fallback** — Vault data can be read from on-chain if DB entry missing
7. **200 OK on event failures** — Intake returns HTTP 200 even when event handler promises reject

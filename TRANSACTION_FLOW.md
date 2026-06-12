# Transaction Execution Data-Flow Map — DreamX HODLBonds Audit Trace

> **Target commit:** `c8cf89e38a3ec77941a04bd64cb173434ceffcf8`
> **Focus:** trading-api, executor, executor intake, PubSub flow
> **Status:** Flow mapping only — no vulnerability findings
> **Date:** 2026-06-12

---

## 1. Transaction Execution Flow Map

### Flow 1: Place Order → Blockchain (Primary Path)

**Rank:** `CRITICAL_PATH`

**1. User/Input Source**

- HTTP POST `/v0/orders/{chainId}` → `routers/v0/orders.ts:77-83`
- Body validated via `CreateOrderBodySchema` — fields: `clientOrderId` (32 hex chars), `vaultAddress` (EthereumAddress), `side` (buy|sell), `size` (positive decimal string)

**2. Route/Job/Function Name**

- `ordersRouter → POST /{chainId}` → `orderService()` at `services/order.ts:169-335`

**3. Validation Performed**

- **HMAC auth** at router level: `hmacAuth()` — verifies `X-Api-Key`, `X-Timestamp`, `X-Signature` with HMAC-SHA256, replay protection (LRU cache), timing-safe comparison
- **Body limit**: 1KB on `/v0/*`
- **Rate limiting**: 60/min sustain + 10/sec burst
- **SQL injection guard**: regex patterns on query params
- **Zod schema**: chainId (enum of supported chains), clientOrderId (32 hex), vaultAddress (checksummed), side, size
- **Duplicate detection**: `onConflictDoNothing` on `clientOrderId` UNIQUE constraint
- **Vault state**: reads bond from DB (requires `isComplete=true`) or falls back to blockchain
- **Balance check**: `availableBalance >= requiredAmount`
- **DEX quote**: positive output, oracle deviation ≤ 3%, slippage 0.25%
- **Simulation**: simulates vault contract call with Merkle proof (except Uniswap V4 — not implemented)

**4. Auth/Permission Checks**

- HMAC key lookup from `env.API_KEYS` (Map<string,string>)
- **No per-key permission scoping** — any valid key can place any order on any chain/vault
- `c.set("apiKeyId", keyId)` stored in context but **never checked downstream**

**5. Database Reads/Writes**

- **INSERT** `tradeRequests` with status `created`
- **SELECT** `bonds` with joined `pairs` where `isComplete=true`
- **Token cache**: reads from in-memory `tokenCache` (loaded from DB `tokens` table at startup)
- **UPDATE** → `rejected` on validation failure
- **UPDATE** → `submitted` with `messageId` + `expiresAt` on successful publish

**6. Calldata/Transaction Fields Created (Published to PubSub)**
Message published to `env.EXECUTOR_PUBSUB_TOPIC` via `HodlBondsTradeClient`:

- `op`: `BLACKHOLE_EXACT_IN` | `LFJ_EXACT_IN` | `UNISWAP_EXACT_IN`
- `clientOrderId`: from user input
- `poolAddress`: vault address from user input
- `inputToken`: token address (derived from side + DEX config)
- `quantity`: `inputToken.parse(size)` as string — **attacker controls `size`**
- `minAmountOut`: quote \* (10000-25)/10000 as string — **derived from DEX quote, not user-controlled**
- `deadline`: now+300s as number
- (Uniswap only) `zeroForOne`: boolean

**7. Signer Used**

- **No signing in this flow.** Signing occurs only in the executor.

**8. Destination Contract/Address**

- PubSub topic → executor intake
- The executor will call `vaultAddress` (the DualTokenVault contract) on-chain

**9. Failure/Retry Behavior**

- **Validation failure** → status `rejected`, exception re-thrown (422/400)
- **DEX backup**: primary → backup DEX fallback
- **Publish failure** → error thrown, status remains `created` (NO rollback — orphaned row)
- **No message-level retry** from this side

**10. Attacker-Controlled Fields**

- `clientOrderId` — 32 hex chars, no semantic validation beyond format
- `vaultAddress` — any valid address; attacker can specify a non-vault or malicious contract (simulation is the defense)
- `side` — buy or sell
- `size` — decimal string, parsed by token; **directly controls `quantity` in the calldata**

---

### Flow 2: PubSub Intake → Queue Table

**Rank:** `HIGH_RISK`

**1. User/Input Source**

- CloudEvent from PubSub push subscription → `intake/src/index.ts:71-108`
- Data: base64-decoded JSON from PubSub message body

**2. Route/Job/Function Name**

- Cloud Function → `Intake.processMessage()`

**3. Validation Performed**

- `MessageFactory.createMessage()` dispatches by executor type
- For HodlBondsTrade: validates via `HodlBondsTradeDataSchema` (discriminated union by `op`)
- Schema validation: `EthereumAddress`, `PositiveIntegerString`, `UnixTimestampSecondsAfter2001`, `ClientOrderId`

**4. Auth/Permission Checks**

- **None.** The Cloud Function is invoked by PubSub push; relies entirely on GCP IAM.
- **TODO in source**: "Maybe split into different pubsubs per executor (More secure to have more granular access rights)."

**5. Database Reads/Writes**

- **INSERT** into `queue` table with status `QUEUED`, priority, executor, earliest/latest try, network, data (jsonb), `task_hash`
- **Dedup**: `onConflictDoNothing` on `task_hash` unique index
- **Fallback dedup**: re-query by network+executor+earliest_try+data+task_hash

**6. Calldata/Transaction Fields Created**

- The `data` jsonb column stores the entire `HodlBondsTradeData` object
- `task_hash`: `computeHash(message)` — SHA-256 of canonical JSON

**7. Signer Used**

- None

**8. Destination Contract/Address**

- `queue` table (PostgreSQL — executor's separate DB)

**9. Failure/Retry Behavior**

- Insert failure → throw error (PubSub will retry delivery)
- Duplicate → silently drop (log warning)
- Schema validation failure → throw (raw error surfaces in logs)

**10. Attacker-Controlled Fields**

- **Every field** in the message data if an attacker can publish to the PubSub topic:
  - `poolAddress`, `inputToken`, `quantity`, `minAmountOut`, `deadline`, `clientOrderId`
- **Key concern**: if PubSub IAM is too permissive, anyone can enqueue arbitrary tasks

---

### Flow 3: Executor Queue Polling → On-Chain Execution

**Rank:** `CRITICAL_PATH`

**1. User/Input Source**

- Executor polls PostgreSQL `queue` table in a loop via `ExecutionManager.processQueue()`
- Triggered by `setTimeout` with `processQueueDelay`

**2. Route/Job/Function Name**

- `ExecutionManager.getQueue()` → `getQueueOfType()` → `executeTask()`

**3. Validation Performed**

- **SERIALIZABLE transaction isolation** — prevents double-claiming
- Status filter: QUEUED or ERROR_RETRY
- Time constraints: `earliest_try <= now()`, `next_attempt <= now()`
- Retry region check: if ERROR_RETRY, previous region must differ or block deadline passed
- `maxTasks` limited by available wallet count

**4. Auth/Permission Checks**

- None at application level. Relies on DB connection credentials.
- Region segregation via `previous_attempt_region` column

**5. Database Reads/Writes**

- **SELECT** with `FOR UPDATE` (within serializable transaction) for QUEUED/ERROR_RETRY tasks
- **UPDATE** → `EXECUTING` immediately after claiming
- **UPDATE** → `EXECUTED` with `tx_hashes`, `gas_price`, `gas_usage` on success
- **UPDATE** → `ERROR_RETRY` on retryable failure
- **UPDATE** → `ERROR_NO_RETRY` on permanent failure

**6. Calldata/Transaction Fields Created (Signed & Broadcast)**
From `HodlBondsTrade.execute()`:

- **LFJ_EXACT_IN**: `lbSwapExactInputSingle(quantity, minAmountOut, inputToken, deadline, merkleProof, gasParams)`
- **BLACKHOLE_EXACT_IN**: `blackholeSwapExactInputSingle(quantity, minAmountOut, inputToken, deadline, merkleProof, gasParams)`
- **UNISWAP_EXACT_IN**: `swapExactInputSingle(quantity, minAmountOut, deadline, zeroForOne, merkleProof, gasParams)`

Where:

- `quantity` = `task.data.quantity` — **from PubSub message**
- `minAmountOut` = `task.data.minAmountOut` — **from PubSub message**
- `inputToken` = `task.data.inputToken` — **from PubSub message**
- `deadline` = `task.data.deadline` — **from PubSub message**
- `merkleProof` = generated by executor from its own wallet address — **NOT from user input**
- `gasParams` = computed by executor (gas price, priority fee, gas limit)

**7. Signer Used**

- A `Wallet.signer` (ethers.js `Signer`) derived from HD wallet (BIP-44 path per index)
- Wallet index assigned round-robin from `availableWallets` queue
- `signer.getAddress()` used to generate Merkle proof

**8. Destination Contract/Address**

- `hodlBondsTradeData.poolAddress` (from PubSub message) — the vault contract
- Loaded via `ExecutorAbstract.getContract("Vault", network, signer, poolAddress)`
- ABI and address looked up from `contracts` table in DB by network + contract name

**9. Failure/Retry Behavior**

- **Exception during execution** → `EXCEPTION` status, request new provider connection, exponential backoff retry
- **Transaction revert** (status=0) → `ERROR_RETRY` if `shouldRetry=true`
- **Timeout** (1.5min for confirmation) → failure
- Gas calculation errors → exception → retry
- Retry deadline: `defaultRetryDeadline` interval from `earliest_try`

**10. Attacker-Controlled Fields (from task.data)**

- `quantity` — exact trade amount; **controls how much token is swapped**
- `minAmountOut` — minimum output; **could be set to 0 or very low** (though originally set by trading-api with slippage)
- `poolAddress` — vault contract to call; **could target any contract**
- `inputToken` — token address
- `deadline` — transaction deadline
- `zeroForOne` — swap direction (Uniswap only)

---

### Flow 4: Status Callback (Executor → Trading API)

**Rank:** `MEDIUM_RISK`

**1. User/Input Source**

- Executor publishes to PubSub topic via `TradingApiClient.publishOrderStatusUpdate()`
- Triggered from `HodlBondsTrade.publishUpdate()` lifecycle hooks: `onTaskStarted`→"pending", `onTaskExecuted`→"executed", `onTaskRetry`→"retry", `onTaskFailed`→"failed"

**2. Route/Job/Function Name**

- PubSub push subscription → `orderStatusRouter POST /internal/order-status/`

**3. Validation Performed**

- **OIDC token verification**: `verifyPubSubOidcToken()` — validates Google-issued JWT, verifies audience (`SERVICE_URL`) and email (`PUBSUB_SERVICE_ACCOUNT_EMAIL`)
- **PubSub envelope validation**: `PubSubPushMessageSchema`
- **Status update validation**: `ExecutorStatusUpdateSchema` — `clientOrderId`, `status`, `timestamp`, optional `txHash`/`taskId`
- **Terminal state guard**: ignores updates if status is already `executed` or `failed`
- **Timestamp ordering**: ignores stale updates where incoming timestamp ≤ `lastStatusAt`

**4. Auth/Permission Checks**

- OIDC token with email check
- **No rate limiting** on `/internal/*` routes

**5. Database Reads/Writes**

- **SELECT** current trade request by `clientOrderId`
- **UPDATE** `tradeRequests` with new status, `lastStatusAt`, optionally `txHash` + `executedAt`

**6. Calldata/Transaction Fields Created**

- None (database update only)

**7. Signer Used**

- None

**8. Destination Contract/Address**

- `tradeRequests` table in PostgreSQL

**9. Failure/Retry Behavior**

- Invalid OIDC → 401 error, PubSub may retry delivery
- Order not found → return 200 success (prevents noisy retries)
- Terminal state → 200 success (ignore)
- Stale timestamp → 200 success (ignore)
- DB update failure → 500 error, PubSub retries

**10. Attacker-Controlled Fields**

- If OIDC is compromised: `clientOrderId`, `status`, `txHash`, `timestamp` all attacker-controlled
- `txHash` could be set to any valid-looking hash; used only for display/logging
- **Impact**: attacker could set order to `executed` with a fake `txHash`, bypassing actual execution

---

## 2. Signing/Key Flow Map

### Flow A: Seed Phrase → Wallet Derivation → Signing

**Rank:** `CRITICAL_PATH`

**Seed Phrase Retrieval:**

- `WalletManager.getSeedPhrase()` reads from Google Cloud Secret Manager
- API call: `projects/{GCP_PROJECT_ID}/secrets/{SEED_PHRASE_SECRET}/versions/latest`
- Returns plaintext seed phrase string

**Wallet Initialization:**

- `initWallets(count, seedPhrase)` validates seed phrase (12 or 24 word regex)
- Creates `Mnemonic.fromPhrase(seedPhrase)` → `HDNodeWallet.fromMnemonic(mnemonic)`
- Derives Wallet 0 (master/refueling wallet) at index 0 with default path
- Derives working wallets from `walletOffset` to `walletOffset + walletCount - 1` using BIP-44 indexed paths
- Each wallet has an ethers.js `Signer` in `Wallet.signer`

**Merkle Tree for On-Chain Auth:**

- `buildMerkleTreeManager(seedPhrase)` derives ALL global wallet addresses
- Builds Merkle tree with `keccak256(address)` as leaves
- `generateProof(walletAddress)` produces the Merkle proof sent on-chain
- **Purpose**: verifies the executor wallet is an authorized trader on the DualTokenVault contract

**Signing Operations:**

- `ExecutionManager.executeTask()` passes `wallet.signer` to `executor.execute(task, signer)`
- `HodlBondsTrade.execute()` uses `signer` to create ethers Contract, calls swap function
- `ExecutionResult.processSingleTransaction()` calls `func(...params)` → `TransactionResponse` → `response.wait(1, 90000)`

**Gas Management (Refueling):**

- `fuelNeedingWallets()` sends ETH from Wallet 0 to worker wallets via `sendTransaction({to, value})`
- Wallet 0 must maintain `wallet0BalanceLowWatermark` ETH balance
- **Critical**: Wallet 0 controls all worker wallet gas; compromise of Wallet 0 = all wallets drained

**Memory Safety:**

- `seedPhrase = null` after use in `start()` — cleared from memory
- `Signer` objects persist in memory for the lifetime of wallet objects
- Private keys implicitly available through ethers.js Signer objects

**Key Hierarchy:**

```
Seed Phrase (GCP Secret Manager)
  └── HDNodeWallet (BIP-39 mnemonic)
       ├── Wallet 0 (index 0, master/refueling wallet)
       │     └── ethers.Signer → sendTransaction for gas refueling
       │
       └── Working Wallets (walletOffset ... walletOffset+walletCount-1)
             └── ethers.Signer → sendTransaction for vault swaps
```

**Attacker-Controlled Impact Points:**

- GCP Secret Manager access → full seed phrase exposure → ALL wallets compromised
- Deterministic derivation; seed phrase leak = permanent compromise
- No HSM, no key sharding, no threshold signing

---

## 3. PubSub/Message Flow Map

```
Trading API                        Google PubSub                    Executor Intake (GCF)
───────────                        ─────────────                    ────────────────────
orderService()
  │
  ├─ HodlBondsTradeClient                                          ┌─ cloudEvent("blockchainExecutorIntake")
  │  .publishHodlBondsTradeUpdate() →│──────────────────────────────┤  .processMessage()
  │  topic: EXECUTOR_PUBSUB_TOPIC    │         PubSub Topic         │    → MessageFactory.createMessage()
  │                                 │                              │    → INSERT queue (task_hash dedup)
  │                                 │                              └──── queue table (PostgreSQL)
  │                                 │
  │                                 │                              Executor GCE (polling loop)
  │                                 │                              ┌───────────────────────
  │                                 │                              │ ExecutionManager
  │                                 │                              │  .getQueue() → SELECT ... FOR UPDATE
  │                                 │                              │  .executeTask(task, wallet.signer)
  │                                 │                              │    → HodlBondsTrade.execute()
  │                                 │                              │    → contract.swapFunction(...)
  │                                 │                              │    → sendTransaction() → on-chain
  │                                 │                              │
  │                                 │                              │ On lifecycle hooks:
  │                                 │                              │  HodlBondsTrade
  │                                 │                              │   .publishUpdate(status)
  │                                 │                              │    → TradingApiClient
  │                                 │         PubSub Topic         │      .publishOrderStatusUpdate()
  │                                 │←─────────────────────────────┤      topic: TRADING_API_STATUS_TOPIC
  │                                 │                              │
  │  orderStatusRouter                                              │
  │   POST /internal/order-status ←────────────────────────────────┘
  │    verifyPubSubOidcToken()
  │    UPDATE tradeRequests status
  └── response { success: true }
```

**Message Data Transmitted:**

| Direction      | Message Type                               | Key Fields                                                                                                             |
| -------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| API → Executor | `HodlBondsTradeData` (discriminated union) | `op`, `clientOrderId`, `poolAddress`, `inputToken`, `quantity`, `minAmountOut`, `deadline` (+`zeroForOne` for Uniswap) |
| Executor → API | `OrderStatusUpdate`                        | `clientOrderId`, `status` (pending/executed/retry/failed), `timestamp`, `txHash?`                                      |

**Critical Observation**: The PubSub message contains ALL parameters that will be used in the on-chain transaction. There is no re-validation of `minAmountOut`, `quantity`, or `poolAddress` at the executor signing stage. The executor trusts the data from the PubSub message.

---

## 4. Database State Transition Map

### `trade_requests` table (trading-api shared DB)

```
[INSERT] status="created"
    │
    ├─ Validation failure in orderService() ──→ status="rejected" + failureReason
    │
    ├─ PubSub publish success ────────────────→ status="submitted" + messageId + expiresAt
    │    │
    │    └─ (executor callback: onTaskStarted)──→ status="pending"
    │         │
    │         ├─ (executor callback: onTaskRetry)─→ status="retry"
    │         │    └─ ... retry loop ...
    │         │
    │         ├─ (executor callback: onTaskExecuted)─→ status="executed" + txHash + executedAt
    │         │
    │         └─ (executor callback: onTaskFailed)──→ status="failed"
    │
    └─ PubSub publish failure ────────────────→ status="created" (NO update — orphaned row)
```

**Terminal states**: `executed`, `failed`, `rejected` — no further updates allowed
**Staleness guard**: incoming `timestamp` must be > `lastStatusAt`

### `queue` table (executor's separate DB)

```
[INSERT] status=QUEUED (by intake)
    │
    └─ ExecutionManager.getQueue() (SERIALIZABLE, FOR UPDATE)
         │
         └─ status=EXECUTING (claimed)
              │
              ├─ Success ─────────────────→ status=EXECUTED + tx_hashes + gas_price + gas_usage
              │
              ├─ Retryable failure ──────→ status=ERROR_RETRY + next_attempt
              │    └─ (re-queued when next_attempt ≤ now())
              │         └─ ... retry loop until retry deadline ...
              │
              ├─ Non-retryable failure ──→ status=ERROR_NO_RETRY + status_message
              │
              └─ Exception ──────────────→ status=EXCEPTION (may also schedule retry)
```

### State Transition Guards

| Guard                             | Location                  | What it prevents                   |
| --------------------------------- | ------------------------- | ---------------------------------- |
| `SERIALIZABLE` isolation          | `ExecutionManager.ts:111` | Double-claiming same queue task    |
| `FOR UPDATE`                      | `ExecutionManager.ts:126` | Row-level lock on claimed task     |
| `onConflictDoNothing` (task_hash) | Intake.ts                 | Duplicate task insertion           |
| Terminal state check              | `order-status.ts:77`      | Overwriting executed/failed orders |
| Timestamp ordering                | `order-status.ts:86`      | Stale status updates               |
| `regionRetryBlockDeadline`        | `ExecutionManager.ts:188` | Same region retry flood            |

---

## 5. Risk-Ranked Flow List

### `CRITICAL_PATH` — Direct path to fund loss, signing, or wallet compromise

| #          | Flow                         | Risk              | Rationale                                                                                                                                                                                                                                                                                                                    |
| ---------- | ---------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **F1**     | Place Order → Blockchain     | **CRITICAL_PATH** | Full pipeline: user input → order validation → PubSub → executor → on-chain transaction. Attacker-controlled `vaultAddress` can target any contract; `size` directly controls token amount. Simulation is the only guard against bad contracts.                                                                              |
| **F3**     | Executor Queue → On-Chain    | **CRITICAL_PATH** | **Direct signing path.** The executor signs and broadcasts real transactions using derived HD wallet keys. Every field in `task.data` (from PubSub) feeds directly into calldata. `quantity` and `minAmountOut` are the most critical attacker-controlled fields. There is NO re-validation of these values at the executor. |
| **Flow A** | Seed Phrase → Wallet Signing | **CRITICAL_PATH** | Seed phrase stored in GCP Secret Manager → deterministic wallet derivation (BIP-44) → ethers.js Signer objects. Compromise = full fund loss. Wallet 0 (master) can refuel all worker wallets; any worker wallet can sign arbitrary vault swaps. No HSM/KMS.                                                                  |

### `HIGH_RISK` — Important path with potential for abuse

| #      | Flow                  | Risk          | Rationale                                                                                                                                                                                                                                                                           |
| ------ | --------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **F2** | PubSub Intake → Queue | **HIGH_RISK** | **No application-level auth** on the intake GCF. If PubSub IAM is misconfigured, anyone can enqueue arbitrary tasks. Source code contains a TODO noting this security gap. Schema validates format but not authorization — any validly-structured `HodlBondsTradeData` is accepted. |
| **F4** | Status Callback       | **HIGH_RISK** | OIDC auth protects the endpoint, but `/internal/*` routes have **no rate limiting**. If OIDC token is compromised, attacker can set arbitrary statuses (`executed`, `failed`) on any order. Terminal state guard and timestamp ordering provide defense-in-depth.                   |

### `MEDIUM_RISK` — Notable path with limited impact

| #                  | Flow                     | Risk            | Rationale                                                                                                                                                                                                                                              |
| ------------------ | ------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **HMAC Auth**      | API Authentication       | **MEDIUM_RISK** | No per-key permission scoping — any valid API key can place orders on any chain/vault. If a single key is compromised, all chains/vaults exposed. Replay protection is strong (LRU cache, timestamp window).                                           |
| **DEX Quote**      | Oracle Validation Bypass | **MEDIUM_RISK** | Oracle validation **skipped on testnets** (`oracle.ts:97` — `!client.chain.testnet` check). Slippage fixed at 0.25% (25 bps). Maximum oracle deviation 3% (300 bps).                                                                                   |
| **DEX Simulation** | Simulation Account       | **MEDIUM_RISK** | Simulation uses `env.EXECUTOR_ADDRESSES[0]` hardcoded. Merkle proof generated from this address. If simulation account not a valid trader on-chain, simulation reverts — but this also means executor execution would fail (same contract, same role). |
| **Uniswap V4**     | Simulation Skipped       | **MEDIUM_RISK** | `simulateSwap()` for Uniswap V4 is a no-op (`uniswap-v4.ts:133-137`). Orders could be published that would revert on execution. No pre-flight validation.                                                                                              |

### `LOW_RISK` — Informational

| #             | Flow            | Risk         | Rationale                                                                            |
| ------------- | --------------- | ------------ | ------------------------------------------------------------------------------------ |
| Order Queries | GET /v0/orders  | **LOW_RISK** | Read-only, HMAC-protected. Read-after-write consistency considerations.              |
| Vault Queries | GET /v0/vaults  | **LOW_RISK** | Public (no auth), etag-cached, rate-limited. No execution impact.                    |
| Token Cache   | In-memory cache | **LOW_RISK** | Loaded at startup from DB. Stale entries if tokens added at runtime without refresh. |
| Health Check  | GET /health     | **LOW_RISK** | Public endpoint, leaks DB connection status and cache readiness.                     |

---

## 6. NEEDS SOURCE Questions

| #        | Question                                                                                                                                            | Impact                                                                                                                                                  |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **NS1**  | What is the value of `env.API_KEYS` at deployment? How are API keys generated, stored, and rotated? Are there multiple keys with different scopes?  | No per-key permission scoping — any key can place any order on any chain/vault.                                                                         |
| **NS2**  | What is the value of `env.EXECUTOR_ADDRESSES`? How many executor addresses are configured?                                                          | Used for Merkle proof generation in DEX simulation and on-chain verification.                                                                           |
| **NS3**  | What is the PubSub topic name for `EXECUTOR_PUBSUB_TOPIC`? Is the topic access-controlled to only allow the trading-api service account to publish? | **If PubSub topic is publicly writable, anyone can enqueue arbitrary tasks for the executor to sign and broadcast.**                                    |
| **NS4**  | What is the value of `env.SEED_PHRASE_SECRET`? Which GCP project contains this secret? What are the IAM bindings on it?                             | Direct private key material exposure risk.                                                                                                              |
| **NS5**  | What are the actual config values for `walletCount`, `walletOffset`, and `totalGlobalWalletCount` in the executor's JSON config?                    | Determines how many signing wallets exist and their HD paths.                                                                                           |
| **NS6**  | What is the actual `DATABASE_URL` for the executor DB? Is it the same database as the trading-api DB or separate?                                   | If the same DB, the executor can read/write trade_requests directly and the trading-api can read/write the queue table — potential cross-contamination. |
| **NS7**  | What is the `BLOCKCHAIN_EXECUTOR_CONFIG` path and JSON config file location at deployment?                                                          | Contains all runtime config including provider endpoints, gas settings, retry parameters.                                                               |
| **NS8**  | What are the RPC endpoints in `walletManager.providerEndpoint`? Are they private or public?                                                         | If public RPC, the executor is exposed to front-running, DoS, or unreliable data.                                                                       |
| **NS9**  | Does the on-chain `DualTokenVault` contract have any access controls beyond the Merkle tree verification for the trader role?                       | If no additional controls, any executor wallet could drain any vault.                                                                                   |
| **NS10** | How is the `Vault` contract's ABI loaded into the executor's `contracts` table? Is it the same for all networks?                                    | The executor loads contract ABIs and addresses from DB; if DB compromised, execution could target malicious contracts.                                  |
| **NS11** | What is the actual `SERVICE_URL` and `PUBSUB_SERVICE_ACCOUNT_EMAIL` for the internal order status endpoint?                                         | OIDC audience and email verification values for status callback authentication.                                                                         |
| **NS12** | What is the intake's database configuration (connection string, schema)?                                                                            | The intake is a GCF that connects to the executor DB; determines reliability of the queue insertion.                                                    |
| **NS13** | Are there separate PubSub topics per executor type / per region? The Intake.ts TODO suggests this improvement.                                      | If one topic serves all executor types, a message crafted for HodlBondsTrade could potentially match other executor schemas.                            |
| **NS14** | What is the value of `processQueueDelay` and `maxRetryInterval` in the executor config?                                                             | Determines how frequently the executor polls and how long it backs off on failures. Affects DoS resilience.                                             |
| **NS15** | How is the `Vault` ABI resolved at executor runtime? Is it loaded from `contracts` table or embedded?                                               | Determines which contract interface the executor uses to construct calldata.                                                                            |

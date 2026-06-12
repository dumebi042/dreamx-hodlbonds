# Audit Pass 4: Event Ingestion, Replay & Idempotency Review

> **Target commit:** `c8cf89e38a3ec77941a04bd64cb173434ceffcf8`
> **Focus:** dreamx-hodlbonds-api/apps/intake event pipeline, financial state impacts
> **Date:** 2026-06-12

---

## 1. Event Ingestion/Replay Map

```
Alchemy Webhook                Intake API (Cloud Run)                PostgreSQL
───────────────                ─────────────────────                ──────────

POST /webhooks/alchemy/:chainId
  │
  ├─ validateAlchemySignatureMultiKey()    ← env.ALCHEMY_SIGNING_KEYS
  │    [HMAC-SHA256 over raw body, iterates keys]
  │
  ├─ transformAlchemyPayload()
  │    [Alchemy webhook → viem Log[] format]
  │
  ├─ routeEvents(chainId, logs)
  │    │
  │    ├─ INSERT INTO intake_events (chainId, txHash, logIndex, rawLog, eventName, args)
  │    │   ON CONFLICT (chainId, txHash, logIndex) DO NOTHING
  │    │
  │    ├─ FOR EACH log:
  │    │   decodeLog() → eventName + args
  │    │   findHandler(eventName) → handler()
  │    │   await handler(args, db)  ← Promise.allSettled
  │    │
  │    └─ UPDATE intake_events SET status = 'success' | 'failed'
  │
  └─ RETURN 200 (even if some handlers fail)


Admin Endpoints (HMAC-protected):
  POST /admin/events/replay                    → replayFailedEvents()
  POST /admin/events/replay/:chainId/:tx/idx   → replayEvent()
  POST /admin/events/ingest/:chainId/:tx       → ingestTransaction()

  replayFailedEvents():
    SELECT intake_events WHERE status = 'failed'
    UPDATE SET status = 'pending' WHERE status = 'failed'
    FOR EACH: re-run routeEvents() with stored rawLog

  ingestTransaction(chainId, txHash):
    GET txReceipt from RPC
    extract logs
    routeEvents(chainId, logs)  ← same path as webhook
```

---

## 2. Tables Written by Each Handler + Constraints

| Handler                  | Table(s) Written        | PK                                          | Unique Constraint                                       | Conflict Handling                                                                                    |
| ------------------------ | ----------------------- | ------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `approved-pair-set`      | `pairs`                 | `(chainId, factoryAddress, id)`             | `pairs_pkey` (implicit)                                 | INSERT ON CONFLICT (`chainId`, `factoryAddress`, `id`) DO UPDATE SET ...                             |
| `approved-token-set-set` | `marketplaceTokenSets`  | `(chainId, marketplaceAddress, tokenSetId)` | `marketplace_token_sets_pkey` (implicit)                | INSERT ON CONFLICT (`chainId`, `marketplaceAddress`, `tokenSetId`) DO UPDATE                         |
| `bond-issued`            | `bonds`                 | `id` (serial)                               | `bonds_chain_vault_unique` on `(chainId, vaultAddress)` | INSERT ON CONFLICT (`chainId`, `vaultAddress`) DO UPDATE SET ...                                     |
| `bond-redeemed`          | `bonds`                 | `id` (serial)                               | `bonds_chain_vault_unique`                              | INSERT ON CONFLICT (`chainId`, `vaultAddress`) DO UPDATE                                             |
| `vault-created`          | `bonds`                 | `id` (serial)                               | `bonds_chain_vault_unique`                              | INSERT ON CONFLICT (`chainId`, `vaultAddress`) DO UPDATE                                             |
| `trade-completed`        | `trades`                | `(chainId, txHash, logIndex)`               | `trades_pkey` (implicit PK)                             | **NO ON CONFLICT** — insert-only                                                                     |
| `listing-created`        | `listings`              | `(chainId, marketplaceAddress, listingId)`  | `listings_pkey` (implicit PK)                           | INSERT ON CONFLICT (`chainId`, `marketplaceAddress`, `listingId`) DO UPDATE                          |
| `listing-cancelled`      | `listings`              | `(chainId, marketplaceAddress, listingId)`  | `listings_pkey`                                         | INSERT ON CONFLICT (`chainId`, `marketplaceAddress`, `listingId`) DO UPDATE SET status = 'cancelled' |
| `listing-purchased`      | `listings`              | `(chainId, marketplaceAddress, listingId)`  | `listings_pkey`                                         | INSERT ON CONFLICT (`chainId`, `marketplaceAddress`, `listingId`) DO UPDATE                          |
| `transfer-single`        | `receiptTokenTransfers` | `(chainId, txHash, logIndex, tokenId)`      | `receipt_token_transfers_pkey` (implicit PK)            | **NO ON CONFLICT** — insert-only                                                                     |
| `transfer-batch`         | `receiptTokenTransfers` | `(chainId, txHash, logIndex, tokenId)`      | `receipt_token_transfers_pkey`                          | **NO ON CONFLICT** — insert-only                                                                     |
| `fee-collected`          | `feesCollected`         | `(chainId, txHash, logIndex)`               | `fees_collected_pkey` (implicit PK)                     | INSERT ON CONFLICT DO UPDATE                                                                         |

### Key Observations:

1. **`trades`, `receiptTokenTransfers` have NO ON CONFLICT** — replaying the same on-chain event would cause a PK violation (not silent duplication, but an exception)
2. `bonds` has proper upsert with generated column `isComplete`
3. `listings` has proper upsert across all lifecycle handlers
4. `pairs`, `marketplaceTokenSets`, `feesCollected` all have upsert

---

## 3. New Candidates

### C12 — Trade Completed: No ON CONFLICT on `trades` Insert → Replay Causes Exception

**Status:** `NO_REPORTABLE_FINDING_YET`

**Source:** `handlers/trade-completed.ts` — raw `db.insert(tradesSchema).values({...})` without `.onConflictDoNothing()` or `.onConflictDoUpdate()`

**Impact:** Replaying a `TradeCompleted` event (via admin replay) where the trade already exists causes a PK violation error. The entire `routeEvents()` batch continues via `Promise.allSettled`, so other handlers in the same batch still complete. The replay handler in `replay.ts` catches the error.

**Why NOT Critical:**

- `trades` table is read by `GET /v0/vaults` etag display only (no financial logic)
- Trading-api's order execution uses on-chain quotes/simulation (not trades table)
- Executor doesn't read trades table
- Fix needed: add `ON CONFLICT DO NOTHING`

**Verdict:** `NO_REPORTABLE_FINDING_YET` — no fund loss path.

---

### C13 — TransferSingle/Batch: No ON CONFLICT on Transfers → Replay Causes Exception

**Status:** `NO_REPORTABLE_FINDING_YET`

**Source:** `handlers/transfer-single.ts`, `handlers/transfer-batch.ts` — raw insert without conflict handling.

**Impact:** Same as C12 — replay causes PK violation. The `receiptTokenTransfers` table is display/indexing only.

**Why NOT Critical:**

- `receiptTokenBalances` is updated by the same handlers but uses ON CONFLICT
- Transfers table is display/history only
- No financial logic depends on it

**Verdict:** `NO_REPORTABLE_FINDING_YET` — no fund loss path.

---

### C14 — ListingCancelled: Fails on Out-of-Order Arrival

**Status:** `NO_REPORTABLE_FINDING_YET`

**Source:** `handlers/listing-cancelled.ts` — `INSERT ON CONFLICT DO UPDATE SET status = 'cancelled'`. If `listing-created` arrives AFTER `listing-cancelled`, the upsert creates the listing with `status = 'cancelled'`. This is a minor ordering issue with no financial impact.

---

### C15 — BondRedeemed: Fails on Out-of-Order Arrival

**Status:** `NO_REPORTABLE_FINDING_YET`

**Source:** `handlers/bond-redeemed.ts` — upserts bonds row. If `vault-created` or `bond-issued` arrives after `bond-redeemed`, the bond is upserted correctly but may show `isComplete = true` without full configuration data. The `isComplete` generated column handles this safely.

---

### C16 — TradeCompleted: Fails on Out-of-Order Arrival

**Status:** `NO_REPORTABLE_FINDING_YET`

**Source:** `handlers/trade-completed.ts` — inserts `trades` row. No FK to `bonds` exists in the schema, so a trade for a non-existent bond would create orphaned data. Display-only impact.

---

## 4. Financial Consumer Analysis

| Trading-API Feature                        | Data Source                                                                      | Does intake DB corruption affect it?                                                            |
| ------------------------------------------ | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Place order (`order.ts`)                   | DB `bonds` + `pairs` for vault/DEX config; blockchain fallback for missing bonds | **Has blockchain fallback** — if bond not in DB or stale, reads directly from on-chain contract |
| DEX quoting (`dex/*.ts`)                   | On-chain via RPC calls                                                           | No intake DB dependence                                                                         |
| Order status (`order-queries.ts`)          | `tradeRequests` table (NOT written by intake)                                    | Not affected                                                                                    |
| Vault list (`vault-db.ts`, `vaults-db.ts`) | DB `bonds` filtered by `isComplete=true`                                         | Display only; stale data corrected on next refresh                                              |
| Token cache (`token-cache.ts`)             | DB `tokens` table (loaded at startup)                                            | Not written by intake                                                                           |
| Token metadata (`token-details.ts`)        | DB `tokens` table or blockchain fallback                                         | Has blockchain fallback                                                                         |
| Executor signing (`HodlBondsTrade.ts`)     | PubSub messages + own queue DB                                                   | **Completely independent** of intake DB                                                         |

**Conclusion:** No path from corrupted intake DB state to unauthorized fund transfer. The trading-api has blockchain fallback for vault data. The executor operates from its own PubSub messages and queue DB — it never reads intake tables.

---

## 5. Final Status

```
╔═══════════════════════════════════════════════════════════════════╗
║       AUDIT PASS 4 — EVENT INGESTION, REPLAY & IDEMPOTENCY      ║
║                          FINAL STATUS                             ║
║                                                                   ║
║   C12 — Trade Completed No ON CONFLICT:  NO_REPORTABLE_FINDING   ║
║   C13 — Transfer No ON CONFLICT:         NO_REPORTABLE_FINDING   ║
║   C14 — ListingCancelled out-of-order:   NO_REPORTABLE_FINDING   ║
║   C15 — BondRedeemed out-of-order:       NO_REPORTABLE_FINDING   ║
║   C16 — TradeCompleted out-of-order:     NO_REPORTABLE_FINDING   ║
║                                                                   ║
║   OVERALL:  NO_REPORTABLE_FINDING_YET                             ║
║                                                                   ║
║   The intake event pipeline is a read-model projection of         ║
║   on-chain state. All events originate from real blockchain       ║
║   logs verified by Alchemy webhook signatures.                    ║
║                                                                   ║
║   Missing ON CONFLICT on trades/transfers causes exceptions       ║
║   on replay, not silent data corruption.                          ║
║                                                                   ║
║   No financial consumer (trading-api, executor) depends on        ║
║   intake DB state for execution decisions — all critical          ║
║   paths have blockchain fallback or are independent.              ║
║                                                                   ║
║   Event ordering issues produce at most display inconsistency     ║
║   that self-corrects on the next event for the same entity.       ║
╚═══════════════════════════════════════════════════════════════════╝
```

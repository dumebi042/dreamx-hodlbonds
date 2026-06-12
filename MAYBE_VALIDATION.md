# MAYBE Validation Pass — C1 & C6 Final Verdict

> **Target commit:** `c8cf89e38a3ec77941a04bd64cb173434ceffcf8`
> **Date:** 2026-06-12

---

## C1 — Executor Intake PubSub Zero-Trust Gap

### Evidence Table

| #   | Question                                  | Answer                                                                                                                                                                                                                                    | Source Lines                                                |
| --- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Q1  | Where is `EXECUTOR_PUBSUB_TOPIC` created? | Topic created via `gcloud pubsub topics create $BRANCH_NAME-intake-HodlBondsTrade`. Intake cloudbuild.yaml uses `--trigger-topic=` to create implicit push subscription. Trading-api resolves full path from `env.EXECUTOR_PUBSUB_TOPIC`. | `DEPLOYMENT.md:339-341`, `cloudbuild.yaml:212`              |
| Q2  | Which SAs are granted `pubsub.publisher`? | **NONE in source.** Zero `gcloud pubsub topics add-iam-policy-binding` commands in any deployment file.                                                                                                                                   | `cloudbuild.yaml:237-246` (only grants `roles/run.invoker`) |
| Q3  | Is topic name predictable?                | Yes — pattern `$BRANCH_NAME-intake-HodlBondsTrade`. Irrelevant for IAM-protected resources.                                                                                                                                               |                                                             |
| Q4  | Does GCF ingress matter?                  | GCF uses `--ingress-settings=internal-only`. PubSub push reaches internal-only GCF via Google-internal infrastructure — compatible by design.                                                                                             | `cloudbuild.yaml:222`                                       |
| Q5  | Broad publisher access granted?           | **No** — zero `allUsers`, `allAuthenticatedUsers`, project editor, default SA, or multiple app SAs with publisher role in source.                                                                                                         |                                                             |
| Q6  | Trading-api sole publisher?               | **YES** — only `BlackholeAdapter.executeSwap()` and `LFJAdapter.executeSwap()` call `HodlBondsTradeClient.publishHodlBondsTradeUpdate()`.                                                                                                 | `blackhole.ts:240`, `lfj.ts:215`                            |
| Q7  | Public route can publish indirectly?      | **No** — only HMAC-protected `POST /v0/orders` and OIDC-protected `POST /internal/order-status` trigger publishes.                                                                                                                        |                                                             |
| Q8  | Queue insertion validates business logic? | **Schema only** — `HodlBondsTradeDataSchema` validates format, NOT origin, vault registry, DEX config, token direction, or minAmountOut. TODO at `Intake.ts:13-14` documents the gap.                                                     | `Intake.ts:34`, `Intake.ts:13-14`                           |
| Q9  | Forged message leads to vault fund loss?  | **Yes** — `quantity` and `minAmountOut` pass directly to vault swap. Executor wallet IS authorized trader (Merkle proof passes). `minAmountOut: "1"` removes slippage. Real vault holds user tokens.                                      | `HodlBondsTrade.ts:109-148`                                 |
| Q10 | Exact PoC required                        | Publish to topic targeting real vault with `quantity` = vault balance, `minAmountOut` = `"1"`. Executor signs + broadcasts against real vault.                                                                                            |                                                             |

### C1 Final Verdict: **`NEEDS_SOURCE`**

**Rationale:** Code-level issue confirmed (no app auth, explicit TODO in `Intake.ts:13-14`). Deployment files show **ZERO** IAM bindings for `pubsub.publisher` — can neither prove topic is locked down to trading-api SA nor that it's broadly accessible. Per strict rules: _"If source/deployment does NOT show IAM bindings → C1 = NEEDS_SOURCE (not reportable)."_

### PoC Required Before Report

1. `gcloud pubsub topics get-iam-policy main-intake-HodlBondsTrade`
2. If ONLY `hodlbonds-api-trading@PROJECT.iam.gserviceaccount.com` has `pubsub.topics.publish` → **KILL**
3. If broad access → craft and publish forged `HodlBondsTradeData` with `minAmountOut: "1"` targeting real vault

---

## C6 — Intake Admin Route Authorization Relay

### Evidence Table

| #   | Question                                                        | Answer                                                                                                                                                                                                     | Source Lines                                      |
| --- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Q1  | Intake deployment sets `API_KEYS`?                              | **NO.** cloudbuild.yaml sets `CLOUD_SQL_INSTANCE`, `DB_IAM_USER`, `DB_NAME`, `DB_POOL_MAX`, `ALCHEMY_SIGNING_KEYS`. No `API_KEYS` env var or secret.                                                       | `intake/cloudbuild.yaml:49-57`                    |
| Q2  | Admin routes reachable externally?                              | Yes on network level — `--allow-unauthenticated`. Routes at `index.ts:88` are HMAC-protected but publicly reachable.                                                                                       | `cloudbuild.yaml:39`                              |
| Q3  | Same HMAC as trading-api?                                       | **Yes — identical.** Same `hmacAuth()` signature, `buildCanonicalString()`, SHA-256 body hash, LRU cache, timing-safe comparison.                                                                          | Both `middleware/auth.ts`                         |
| Q4  | Trading-api key works on intake if `API_KEYS` set?              | **Yes** — both env packages parse `process.env.API_KEYS` with identical `split(",").map(split(":"))` logic.                                                                                                | `env/intake.ts:29-54`, `env/trading-api.ts:52-77` |
| Q5  | Replay processes real events only?                              | **Yes** — `replayFailedEvents()` only re-processes events from `intake_events` table (real Alchemy webhooks). `ingestTransaction()` fetches from real blockchain RPC. No endpoint accepts fake event data. | `replay.ts:14`, `ingest-transaction.ts:19`        |
| Q6  | Replay duplicates financial state?                              | **No** — handlers use `onConflictDoUpdate`/`onConflictDoNothing`. Balance updates guarded by `balanceBlockNumber < Number(blockNumber)`. Duplicate insert impossible.                                      | `event-router.ts:47-78`, `trade-completed.ts:27`  |
| Q7  | Trading-api/executor consumes mutated state as financial truth? | **Display only** — order execution uses on-chain DEX quotes (`order.ts:121`), not replay-mutated DB data.                                                                                                  | `order.ts:41-93`, `order.ts:121`                  |
| Q8  | Forged events without Alchemy HMAC bypass?                      | **No** — webhook validates `validateAlchemySignatureMultiKey()`. Admin endpoints require `API_KEYS` (not deployed).                                                                                        | `signature-validation.ts:26`                      |
| Q9  | Admin access causes direct fund loss?                           | **No** — even with valid admin credentials: replay real events, ingest real RPC transactions, read stats. None transfer funds, sign txns, or execute code.                                                 |                                                   |
| Q10 | PoC required                                                    | Even with admin credentials: replay only re-processes real failed events. Ingest reads real blockchain receipts. No fake injection. No fund loss.                                                          |                                                   |

### C6 Final Verdict: **`KILL`**

**Rationale:** `API_KEYS` not deployed on intake (cloudbuild.yaml has no such env var). Even with valid admin access: replay/ingest only process **real on-chain events** with idempotency protections. Replay-mutated DB state affects display only — order execution uses on-chain quotes. Per strict rules: _"If intake admin replay only affects display/indexing/read-model state → C6 = KILL."_ Confirms PASS3 assessment.

---

## Final Combined Status

```
╔══════════════════════════════════════════════════════════════════╗
║                    MAYBE VALIDATION PASS                         ║
║                        FINAL STATUS                               ║
║                                                                   ║
║   C1 — Executor Intake Zero-Trust Gap:  NEEDS_SOURCE              ║
║     Code-level issue confirmed (no app auth, TODO in source).     ║
║     Deployment files show ZERO PubSub IAM bindings for publisher  ║
║     role — can neither prove locked down nor broadly accessible.  ║
║     Requires infra-level IAM audit to confirm exploitability.     ║
║     If topic IAM proves locked down: KILL.                        ║
║     If topic IAM proves publicly writable: VALID_CANDIDATE        ║
║     (real fund loss path via executor signing against real vault  ║
║     with attacker-controlled minAmountOut and quantity).          ║
║                                                                   ║
║   C6 — Intake Admin Auth Relay:  KILL                             ║
║     API_KEYS not deployed on intake — admin routes inaccessible.  ║
║     Even with admin access: replay only processes real on-chain   ║
║     events, idempotency protections prevent duplicates, no fund   ║
║     transfer path exists.                                         ║
║                                                                   ║
║   OVERALL:  NEEDS_MORE_PROOF                                      ║
║                                                                   ║
║   C1 is the only surviving candidate but requires infra-level     ║
║   IAM verification (PubSub topic get-iam-policy).                 ║
║   C6 is killed at deployment + impact level.                      ║
║   No candidate achieves independently-exploitable Critical        ║
║   impact from source code + deployment files alone.               ║
╚═══════════════════════════════════════════════════════════════════╝
```

### What Would Change the Status

| If this is true...                                   | C1 becomes          | C6 becomes | Overall                       |
| ---------------------------------------------------- | ------------------- | ---------- | ----------------------------- |
| Topic IAM restricts publisher to trading-api SA only | **KILL**            | KILL       | **NO_REPORTABLE_FINDING_YET** |
| Topic IAM is publicly writable (no restriction)      | **VALID_CANDIDATE** | KILL       | **REPORTABLE_NOW**            |
| Both topic IAM locked AND API_KEYS not deployed      | KILL                | KILL       | **NO_REPORTABLE_FINDING_YET** |

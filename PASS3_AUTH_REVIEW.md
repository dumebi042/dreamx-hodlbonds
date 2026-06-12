# Audit Pass 3: Deep Authentication & Authorization Review

> **Target commit:** `c8cf89e38a3ec77941a04bd64cb173434ceffcf8`
> **Status:** Auth surface mapping + candidate hunting — complete
> **Date:** 2026-06-12

---

## 1. Auth Surface Map

```
                                 INTERNET
                                    │
                    ┌───────────────┼───────────────────┐
                    │               │                    │
               trading-api     intake-api         executor-intake
               (Cloud Run)     (Cloud Run)         (GCF Gen2)
                    │               │                    │
     ┌──────────────┴──┐    ┌───────┴───────┐           │
     │  PUBLIC         │    │  HMAC-SHA256  │    PubSub push
     │  GET /health    │    │  POST /admin/ │    (NO app auth)
     │  GET /v0/time   │    │  events/*     │    [RELIAS ON IAM]
     │  GET /v0/vaults │    │               │           │
     │  GET /v0/docs   │    │  Alchemy HMAC │           ▼
     ├─────────────────┤    │  POST /webhks │    executor-intake
     │  HMAC-SHA256    │    └───────────────┘    → Intake.ts
     │  POST /v0/orders│                              │
     │  GET /v0/orders │                         INSERT queue
     ├─────────────────┤                              │
     │  OIDC JWT       │                              ▼
     │  POST /internal │                       executor (GCE)
     │  /order-status  │                     → ExecutionManager
     └─────────────────┘                     → HodlBondsTrade
        KEY MATERIALS                         → sign + broadcast
        ─────────────
        API_KEYS: env Map<UUID,string>
        ALCHEMY_SIGNING_KEYS: env Record
        PUBSUB_SERVICE_ACCOUNT_EMAIL: env
        SERVICE_URL: env
```

### Auth Boundary Summary

| Boundary              | Mechanism          | Protects                          | Key Material                                        |
| --------------------- | ------------------ | --------------------------------- | --------------------------------------------------- |
| Trading API orders    | HMAC-SHA256        | `POST/GET /v0/orders/*`           | `env.API_KEYS` → `Map<keyId, secret>`               |
| Trading API internal  | OIDC JWT           | `POST /internal/order-status`     | `SERVICE_URL` (aud), `PUBSUB_SERVICE_ACCOUNT_EMAIL` |
| Intake webhooks       | Alchemy HMAC       | `POST /webhooks/alchemy/:chainId` | `ALCHEMY_SIGNING_KEYS` → multi-key map              |
| Intake admin          | HMAC-SHA256        | `GET/POST /admin/*`               | `env.API_KEYS` (same env name as trading-api)       |
| Executor intake       | None (IAM-only)    | PubSub push subscription          | GCP IAM (infrastructure)                            |
| Executor queue claims | SERIALIZABLE DB tx | Task claiming from queue          | DB connection credentials                           |

---

## 2. New Auth Candidates

### C6 — Intake Admin Route Authorization Relay: Both Services Read `API_KEYS` from Same Env Var

**Status:** `DOWNGRADE_TO_NEEDS_SOURCE`

**Source evidence:**

- `intake/src/middleware/auth.ts:9` — `const apiKeys = env.API_KEYS`
- `env/src/intake.ts:29-54` — parses `process.env.API_KEYS` (keyId:secret, comma-separated)
- `env/src/trading-api.ts:52-77` — **identical parser, same `API_KEYS` env var name**
- `intake/cloudbuild.yaml` — **NO `API_KEYS` secret set** (only `ALCHEMY_SIGNING_KEYS`)
- `trading-api/cloudbuild.yaml:60` — `API_KEYS=trading-api-keys-$BRANCH_NAME:latest`
- `intake/src/index.ts:88` — `app.use("/admin/*", hmacAuth(10_000, 500))`

**Attack path:** Both services read `process.env.API_KEYS` with identical parsing logic. If the intake's Cloud Run service is deployed with `API_KEYS` set to the same value as the trading API (whether by misconfiguration or shared Secret Manager binding), then **any valid trading API key holder can call all intake admin endpoints.**

| Admin Endpoint                                         | Effect                                                           |
| ------------------------------------------------------ | ---------------------------------------------------------------- |
| `POST /admin/events/replay`                            | Resets ALL failed events to `pending` and re-runs event handlers |
| `POST /admin/events/replay/:chainId/:txHash/:logIndex` | Replays a specific event                                         |
| `POST /admin/events/ingest/:chainId/:txHash`           | Ingests an on-chain transaction (reads via RPC)                  |
| `GET /admin/events/stats`                              | Reads event processing metrics                                   |

**Impact analysis:** The replay functions at `replay.ts:14-31` call `routeEvents()` which resets failed events to pending and re-runs each handler. If handlers have idempotency bugs, replaying could create duplicate financial records (bonds, vaults, trades, listings). However:

- No direct fund transfer path
- Event data originates from real on-chain logs (Alchemy webhooks), not attacker input
- `ingestTransaction` reads from blockchain RPC — cannot inject fake events
- `replayFailedEvents` only operates on logs already in DB

**Kill evidence (deployment):** The intake cloudbuild **does not set `API_KEYS`**. Without it, `env.API_KEYS` returns empty `Map` → all admin requests rejected. C6 is blocked at deployment level unless someone manually configures `API_KEYS` on the intake service.

---

### C7 — HMAC Canonical String Omits Query Parameters

**Status:** `KILL`

**Source:** `trading-api/src/middleware/auth.ts:94`

```typescript
const path = url.pathname; // No url.search → query params unauthenticated
```

Canonical string: `method\npath\nbodyHash\ntimestamp` — no query parameter component. An attacker with a valid signature for a given path can append query parameters without invalidating the signature.

**Why KILL:** Attacker must already have a valid HMAC key. Defense-in-depth gap only. No Critical impact path — trade requests are POST with body, and query params on GET/orders are authenticated but read-only.

---

### C8 — MessageFactory Ignores Message-Level Executor Type

**Status:** `KILL`

**Source:**

- `Intake.ts:19` — `this.executor` from config
- `MessageFactory.ts:21-35` — dispatches by `this.executor` (hardcoded in config), not by incoming message's `executor` field

**Why KILL:** If a DcaBot message arrives at a HodlBondsTrade-configured intake, `HodlBondsTradeDataSchema.parse()` rejects it (Zod throws). Unit test executor bypass exists but is test-only.

---

### C9 — ExecutionManager.getQueueOfType() Lacks Executor Type Filter

**Status:** `KILL`

**Source:** `ExecutionManager.ts:171-210` — filters by `network` and `status` only — no `executor` type filter.

**Mitigation:** `ExecutorFactory.ts:22-35` dispatches by `task.executor`, creating the correct implementation. Execution proceeds correctly regardless of which instance picked up the task.

**Why KILL:** ExecutorFactory ensures correct dispatch. No auth bypass or type confusion possible.

---

### C10 — Intake Admin Hard-Denied When API_KEYS Unset

**Status:** `KILL`

**Source:** `intake/cloudbuild.yaml` — no `API_KEYS` secret. `env/intake.ts:29-54` — empty Map → all admin requests rejected at `auth.ts:111`.

**Why KILL:** Security-by-default. Not a vulnerability.

---

### C11 — Internal Route No Rate Limiting (C5 from Pass 2)

**Status:** `KILL` (already adjudicated in Pass 2)

---

## 3. Final Status

```
╔═══════════════════════════════════════════════════════════════════╗
║         AUDIT PASS 3 — DEEP AUTH & AUTHORIZATION REVIEW          ║
║                          FINAL STATUS                             ║
║                                                                   ║
║   C6 — Intake Admin Auth Relay:    DOWNGRADE_TO_NEEDS_SOURCE      ║
║     Both services read API_KEYS from same env var with identical  ║
║     parsing. Intake admin routes would accept trading API keys.   ║
║     Blocked at deployment — intake cloudbuild does NOT set        ║
║     API_KEYS. Even if reachable: replay only re-processes real    ║
║     on-chain event data (no fake injection).                      ║
║                                                                   ║
║   C7 — HMAC Query Param Omission:   KILL                          ║
║     Attacker needs valid HMAC key first. Defense-in-depth.        ║
║                                                                   ║
║   C8 — MessageFactory Config Dispatch: KILL                       ║
║     Zod schema validation prevents cross-type message parsing.    ║
║                                                                   ║
║   C9 — Queue Executor Type Filter:   KILL                         ║
║     ExecutorFactory correctly dispatches by task.executor type.   ║
║                                                                   ║
║   C10 — Intake Admin Denied by Default: KILL                      ║
║     Security-by-design. Not a vulnerability.                      ║
║                                                                   ║
║   OVERALL:  NO_REPORTABLE_FINDING_YET                             ║
║                                                                   ║
║   No candidate achieves independently-exploitable Critical        ║
║   impact from in-scope source code alone.                         ║
╚═══════════════════════════════════════════════════════════════════╝
```

### Source Evidence Summary

| #   | Finding                                                      | Key Lines                                                                                       | Verdict                             |
| --- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ----------------------------------- |
| C6  | Intake admin HMAC shares `API_KEYS` env var with trading-api | `intake/auth.ts:9`, `env/intake.ts:29-54`, `env/trading-api.ts:52-77`, `intake/cloudbuild.yaml` | **NEEDS_SOURCE** — deployment-gated |
| C6  | Admin replay mutates DB event state                          | `replay.ts:14-31`, `event-router.ts:47-78`                                                      | Needs handler idempotency audit     |
| C7  | HMAC canonical string omits query params                     | `auth.ts:94` — `url.pathname` only                                                              | **KILL** — needs valid key first    |
| C8  | MessageFactory dispatches by config, not message             | `Intake.ts:19`, `MessageFactory.ts:21-35`                                                       | **KILL** — Zod blocks confusion     |
| C9  | getQueueOfType() has no executor-type filter                 | `ExecutionManager.ts:171-210`                                                                   | **KILL** — ExecutorFactory corrects |
| C10 | Intake cloudbuild omits `API_KEYS`                           | `intake/cloudbuild.yaml`                                                                        | **KILL** — denies all admin access  |
| C11 | `/internal/*` skips rate limiting                            | `index.ts:53,62`                                                                                | **KILL** — Pass 2 C5 stands         |

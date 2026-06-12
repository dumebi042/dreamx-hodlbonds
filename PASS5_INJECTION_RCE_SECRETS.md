# Audit Pass 5: Injection, RCE, SSRF & Secret Exposure Review

> **Target commit:** `c8cf89e38a3ec77941a04bd64cb173434ceffcf8`
> **Date:** 2026-06-12

---

## 1. Injection/RCE/Secrets Surface Map

### User-Controlled URLs

| Component                      | URL Source                                                                | User Control                 | Risk    |
| ------------------------------ | ------------------------------------------------------------------------- | ---------------------------- | ------- |
| Trading API RPC clients        | `networks/index.ts:7-13` — hardcoded chain defs                           | None — hardcoded in source   | 🟢 Safe |
| Executor RPC connection        | `WalletManager.ts:543` — `config.providerEndpoint` from Parameter Manager | Deployment-controlled only   | 🟢 Safe |
| PubSub topic names             | Env vars / Secret Manager                                                 | Deployment-controlled        | 🟢 Safe |
| HTTP client (`http-client.ts`) | Called with hardcoded URLs only                                           | Never called with user input | 🟢 Safe |
| Token metadata URI             | `server/src/services/token.ts:118`                                        | Hardcoded empty string       | 🟢 Safe |

### Shell/Process Execution

| Pattern                                                  | Occurrences                            |
| -------------------------------------------------------- | -------------------------------------- |
| `child_process.exec` / `spawn` / `execFile` / `execSync` | **0** across entire reviewed codebase  |
| `eval()` / `Function()` / dynamic `import()`             | **0**                                  |
| Runtime package script execution                         | **0** — build-time only in Dockerfiles |

### SQL Injection

| Query Pattern                          | Input Path               | Parameterized?                                  |
| -------------------------------------- | ------------------------ | ----------------------------------------------- |
| Drizzle ORM `eq()`, `and()`, `where()` | All Zod-validated inputs | ✅ Yes — Drizzle parameterized                  |
| `sql\`SELECT 1\``                      | None — hardcoded         | ✅ Safe                                         |
| `sql\`SET TRANSACTION...\``            | None — hardcoded         | ✅ Safe                                         |
| `sqlInjectionGuard` middleware         | URL query params only    | 🟡 Defense-in-depth (Zod validates main inputs) |

### File/Path Operations

| Operation                      | Input Source                     | Risk                     |
| ------------------------------ | -------------------------------- | ------------------------ |
| `fs.existsSync(configPath)`    | `env.BLOCKCHAIN_EXECUTOR_CONFIG` | 🟢 Deployment-controlled |
| `fs.readFileSync(configPath)`  | Same env var                     | 🟢 Deployment-controlled |
| Log file paths                 | Derived from configPath          | 🟢 No user input         |
| `process.loadEnvFile(envPath)` | Fixed `./.env`                   | 🟢 Fixed relative path   |

### Secrets Exposure

| Secret           | Location                                                                      | Exposure                                    |
| ---------------- | ----------------------------------------------------------------------------- | ------------------------------------------- |
| Seed phrase      | `WalletManager.ts:61-72` — GCP Secret Manager                                 | ✅ Cleared post-use (`seedPhrase = null`)   |
| RPC API keys     | `WalletManager.ts:540` — **logged at INFO**: `Connecting to Provider: ${url}` | 🔴 Logged in full URL (Infura/Alchemy keys) |
| Wallet addresses | `WalletManager.ts:136,155` — logged at startup                                | 🟢 Public on-chain data                     |
| Task data        | `Intake.ts:59-66,74` — logged on insert                                       | 🟡 Trade parameters only (not secrets)      |
| Merkle proofs    | `ExecutionResult.ts:48-55` — logged                                           | 🟢 Public on-chain data                     |
| Config JSON      | `executor/index.ts:23` — read from filesystem (`:ro` mounted)                 | 🔴 Contains RPC endpoints with API keys     |

### Error Handling

| Endpoint         | Leak                                  | Risk                            |
| ---------------- | ------------------------------------- | ------------------------------- |
| `GET /health`    | `error.message` on DB failure         | 🟡 Generic Cloud SQL IAM errors |
| Zod validation   | `z.treeifyError()` logged server-side | 🟡 Logged only, not returned    |
| Unhandled errors | Generic 500 in production             | 🟢 Production-safe (env-gated)  |

---

## 2. Candidates

### C17 — RPC Provider API Key Leakage via Executor Connection Logs

**Status:** `KILL`

**Source:** `WalletManager.ts:540` — `this.logger.info(\`Connecting to Provider: ${this.config.providerEndpoint}\`)`

**Attack path:** Attacker with Cloud Logging read access extracts Infura/Alchemy API keys from executor startup logs.

**Why KILL:** RPC API keys alone do not enable wallet compromise, fund transfer, or transaction signing. Rate-limit bypass is not Critical per bounty scope.

---

### C18 — Seed Phrase Memory Persistence

**Status:** `KILL`

**Source:** `WalletManager.ts:114-117` — `seedPhrase = null` after use. GC-dependent.

**Why KILL:** Requires arbitrary process memory read — not exploitable from source code alone.

---

### C19 — Health Check Leaks DB Error Details

**Status:** `KILL`

**Source:** `trading-api/index.ts:95`, `intake/index.ts:34` — `error.message` in `/health` response.

**Why KILL:** Cloud SQL IAM auth errors are generic. No connection strings or credentials leaked.

---

### C20 — Full Task Data Logged on Intake Insertion

**Status:** `KILL`

**Source:** `Intake.ts:59-66,74` — full `task` object logged on insert.

**Why KILL:** Trade parameters (quantity, minAmountOut, poolAddress) are user-supplied values that go on-chain. Not secret material.

---

### C21 — Full Function Params Logged in ExecutionResult

**Status:** `KILL`

**Source:** `ExecutionResult.ts:48-55` — `serializeJsonWithBigInt(params)` including merkleProof.

**Why KILL:** Merkle proofs are public on-chain data. No secret material.

---

### C22 — Missing Runtime txHash Validation on Admin Ingest

**Status:** `KILL`

**Source:** `intake/index.ts:139` — TypeScript type assertion only. `ingest-transaction.ts:36` — viem validates internally.

**Why KILL:** HMAC-gated + viem validates internally. Even if bypassed, max impact is viem throwing.

---

## 3. Summary

```
╔══════════════════════════════════════════════════════════════╗
║       AUDIT PASS 5 — INJECTION, RCE, SSRF & SECRETS        ║
║                      FINAL STATUS                            ║
║                                                              ║
║   All 6 candidates:  KILL                                    ║
║                                                              ║
║   OVERALL:  NO_REPORTABLE_FINDING_YET                        ║
║                                                              ║
║   No injection, RCE, SSRF, or secret exposure candidate      ║
║   achieves independently-exploitable Critical impact         ║
║   from in-scope source code alone.                           ║
║                                                              ║
║   Strong defenses observed:                                  ║
║   - All DB queries parameterized via Drizzle ORM             ║
║   - No shell execution or dynamic code                       ║
║   - No user-controlled URLs reaching network calls           ║
║   - Strict Zod validation on all input boundaries            ║
║   - Seed phrase cleared from variable post-use               ║
║   - Error handling gated by NODE_ENV                         ║
║                                                              ║
║   Defense-in-depth gaps (not Critical):                      ║
║   - RPC API keys logged in full URL at executor startup      ║
║   - sqlInjectionGuard only inspects query params              ║
╚══════════════════════════════════════════════════════════════╝
```

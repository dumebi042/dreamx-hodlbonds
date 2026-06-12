# Audit Pass 6: Dependency, Build, Deployment & Supply-Chain Review

> **Target commit:** `c8cf89e38a3ec77941a04bd64cb173434ceffcf8`
> **Date:** 2026-06-12

---

## 1. Build/Deployment/Supply-Chain Surface Map

```
GitHub (2 repos) → GitHub Actions (publish, CI) → Cloud Build (Docker → GCR)
                                                      │
                                                      ▼
                                              Cloud Run (trading-api, intake, server)
                                              Cloud Run Job (price-oracle)
                                              GCF Gen2 (executor-intake, internal-only)
                                              GCE (executor, Docker containers)
                                                      │
                                                      ▼
                                              Cloud SQL (Postgres, 2 instances)
                                              Secret Manager (seed phrase, API keys, topics)
                                              Parameter Manager (RPC configs, wallet configs)
                                              PubSub (EXECUTOR_PUBSUB_TOPIC, TRADING_API_STATUS_TOPIC)
```

### Dependency Chain

```
@hodlbonds-api/*     → workspace:* (link: local monorepo)
@dreamx-development/* → workspace:* (link: local monorepo) → .npmrc scopes to GitHub Packages
External npm deps     → pnpm-lock.yaml with CVE overrides (esbuild, body-parser, jws, qs)
```

---

## 2. Candidates

### C28 — Publish Workflow Non-Frozen Install

**Status:** `KILL`

**Source:** `.github/workflows/publish-packages.yml:31` — `pnpm install` without `--frozen-lockfile`

**Why KILL:** Tag-gated (v\* only), GITHUB_TOKEN scoped to repo packages:write, pnpm v10 restricts lifecycle scripts. Defense-in-depth only.

### C29 — Docker COPY . . May Include .env

**Status:** `KILL`

**Source:** All Dockerfiles `COPY . .`

**Why KILL:** `.gcloudignore` excludes `.env*` from Cloud Build. Multi-stage build copies only from `/pruned` to runner stage. No `.env` reaches production image.

### C30 — Public Cloud Run Services (--allow-unauthenticated)

**Status:** `KILL`

**Source:** trading-api, intake, server cloudbuild.yaml — all `--allow-unauthenticated`

**Why KILL:** By design — trading-api serves public endpoints. App-layer auth (HMAC, OIDC) protects sensitive routes. Executor intake GCF uses `--ingress-settings=internal-only`.

### C31 — RPC API Keys in Parameter Manager Configs

**Status:** `KILL` (same as PASS5 C17)

**Source:** `DEPLOYMENT.md:449` — `"providerEndpoint": "https://mainnet.infura.io/v3/YOUR_KEY"`

**Why KILL:** Already adjudicated. RPC API keys enable rate-limit bypass only, not signer compromise or fund transfer.

### C32 — No .npmrc in Executor Docker Build

**Status:** `KILL`

**Source:** Executor `Dockerfile:17`

**Why KILL:** All `@dreamx-development/*` deps use `workspace:*` resolved via `link:` in lockfile — no external registry resolution needed.

### C33 — PRIVATE_KEY in Dev Deployment Script

**Status:** `KILL`

**Source:** `scripts/deploy-dual-token-vault.ts:7` — `privateKeyToAccount(env.PRIVATE_KEY!)`

**Why KILL:** Dev-only script. Not in production entry point. Not included in Docker build output (scripts/ not in `files`). Only developers running manually would be exposed.

### C34 — Cloud Build Inline JavaScript Rewrites package.json

**Status:** `KILL`

**Source:** Executor-intake `cloudbuild.yaml:66-108`

**Why KILL:** Reads only from `/workspace` (git checkout). No user-controllable values reach the inline JS. Substitution vars used only in `gcloud` args, not in Node script.

### C35 — No ABI Source Hash Verification

**Status:** `KILL`

**Source:** `DEPLOYMENT.md:874-975`

**Why KILL:** `postgres` admin required for ABI modification — infra-level. Executor role has read-only SELECT on `contracts` table (`0001_permissions.sql`). Proper least-privilege design.

---

## 3. Defenses Validated

| Layer                     | Status                                                            | Evidence                         |
| ------------------------- | ----------------------------------------------------------------- | -------------------------------- |
| Package lifecycle scripts | ✅ No postinstall/preinstall/prepare across 17 package.json files | Zero lifecycle scripts           |
| Docker secret persistence | ✅ BuildKit secret mounts + `rm -f .npmrc` after deploy           | trading-api Dockerfile:19-23,30  |
| Multi-stage builds        | ✅ All Dockerfiles: base→build→runner                             | All Dockerfiles                  |
| Git secrets in build      | ✅ `.gcloudignore` excludes `.env*`                               | `.gcloudignore:20`               |
| Seed phrase handling      | ✅ GCP Secret Manager + `seedPhrase = null`                       | `WalletManager.ts:61-72,114-117` |
| DB credentials            | ✅ IAM auth only — no passwords in code                           | cloudbuild YAMLs, DEPLOYMENT.md  |
| Config mounts             | ✅ Read-only (`:ro`) volume mounts                                | `docker-compose.stage.yml:24`    |
| Dependency confusion      | ✅ `@dreamx-development/*` scoped to GitHub Packages              | `.npmrc:1-2`                     |
| CVE overrides             | ✅ Proactive for esbuild, body-parser, jws, qs                    | `pnpm-workspace.yaml:16-18`      |
| Intake ingress            | ✅ GCF Gen2 uses `--ingress-settings=internal-only`               | executor-intake cloudbuild.yaml  |
| DB role separation        | ✅ Intake INSERT+SELECT, executor SELECT+UPDATE                   | `0001_permissions.sql`           |
| CI secrets                | ✅ PR workflow uses test-only env vars                            | `ci.yml:10-19`                   |

---

## 4. Final Status

```
╔═══════════════════════════════════════════════════════════════╗
║     AUDIT PASS 6 — SUPPLY-CHAIN REVIEW — FINAL STATUS        ║
║                                                               ║
║   All 8 candidates:  KILL                                     ║
║                                                               ║
║   OVERALL:  NO_REPORTABLE_FINDING_YET                          ║
║                                                               ║
║   Strong supply-chain defenses:                               ║
║   - Zero lifecycle scripts in all packages                    ║
║   - Multi-stage Docker builds                                 ║
║   - BuildKit secret mounts for npm tokens                     ║
║   - .gcloudignore excludes .env files                         ║
║   - Proactive CVE overrides for transitive deps               ║
║   - Scoped private packages (no confusion risk)               ║
║   - IAM-based DB auth (no connection strings)                 ║
║   - DB role separation (read-only executor role)              ║
╚═══════════════════════════════════════════════════════════════╝
```

# Candidate Validation Pass 2 — Verdict

> **Target commit:** `c8cf89e38a3ec77941a04bd64cb173434ceffcf8`
> **Status:** Validation pass 2 — C4 and C5 stress-tested
> **Date:** 2026-06-12

---

## C4 — Uniswap V4 Simulation No-Op: **KILL**

### Q1: Is Uniswap V4 actually enabled in production config?

**No.** The DEX selection code path has ZERO paths to Uniswap V4:

- `dex/index.ts:66-91` — `getDexSelections()` returns only LFJ/Blackhole
- `dex/index.ts:55` — `primaryDex` typed as `"LFJ" | "BLACKHOLE"` — Uniswap V4 not in type
- `order.ts:72` — DB path: `bond.primaryDex === 1 ? "BLACKHOLE" : "LFJ"` — integer 0=LFJ, 1=BLACKHOLE
- `vault.ts:122` — Blockchain fallback: `PRIMARY_DEX = ["LFJ", "BLACKHOLE"]`
- `types/index.ts:25` — `PRIMARY_DEX` array has only two entries

The `UniswapV4Adapter` class exists and `getDexAdapter()` supports it, but it is **unreachable** — the selection logic never produces `DexType.UNISWAP_V4`.

### Q2: Can a normal valid API key choose Uniswap V4?

**No.** User submits only `vaultAddress`, `side`, `size` — DEX is per-vault config from DB or blockchain, both of which only produce LFJ or BLACKHOLE.

### Q3: Does the order flow always run quote validation before publishing?

**Yes.** `order.ts:284-309` — `tryDex()` always calls `getQuote()`, oracle validation, and `simulateSwap()` before `executeSwap()`. For Uniswap V4 specifically, `getQuote()` and oracle validation still run — only `simulateSwap()` is a no-op.

### Q4: Can stale DB vault balances realistically cause fund loss, or only gas griefing?

**Gas griefing only.** If stale DB balance is higher than on-chain balance, the check at `order.ts:261-269` passes. For LFJ/Blackhole: `simulateSwap()` would catch it with on-chain revert at simulation time. For Uniswap V4 (if reachable): no simulation → order published → executor broadcasts → **on-chain revert** → gas griefing only.

### Q5: Can a wrong Uniswap V4 pool cause fund loss, or would oracle/slippage checks block it?

**Oracle check blocks >3% deviation.** `order.ts:137-145` validates against Chainlink oracle with `MAX_ORACLE_DEVIATION_BPS = 300` (3%). `minAmountOut` at 99.75% of quote (25 bps). Even with manipulated pool, quote deviating >3% from Chainlink is rejected. But **Uniswap V4 is never selected anyway.**

### Q6: Is `minAmountOut` ever attacker-controlled through the API?

**No.** `order.ts:121` — `minAmountOut` from `adapter.getQuote()` with fixed 25 bps slippage via `dex/utils.ts:22-27`.

### Q7: What exactly is missing for Uniswap V4 vs other adapters?

For LFJ/Blackhole: `simulateSwap()` calls the **exact same vault function** the executor will call — `lbSwapExactInputSingle` / `blackholeSwapExactInputSingle`.

For Uniswap V4: `simulateSwap()` at `uniswap-v4.ts:133-137` is a no-op (`return Promise.resolve()`). The executor would call `swapExactInputSingle` — **same function**. Only pre-flight revert detection is missing.

### Q8: What source-level path turns missing simulation into Critical fund loss?

**None.** To reach the missing simulation:

1. `getDexSelections()` must return `UNISWAP_V4` — **impossible**, only LFJ/BLACKHOLE returned
2. DB/blockchain vault config must supply Uniswap V4 — **impossible**, `PRIMARY_DEX = ["LFJ", "BLACKHOLE"]`

Even if reachable: stale balance → on-chain revert → gas griefing only. Oracle check blocks >3% manipulation. `minAmountOut` is always server-computed.

### Q9: Verdict

**KILL.** Uniswap V4 is unreachable — the DEX selection logic never selects it. The missing simulation is a defense-in-depth gap in dead code. Even if reachable, impact is gas griefing only.

---

## C5 — Status Update State Transition Missing: **KILL**

### Q1: Is `/internal/order-status` reachable from the public internet?

**Yes** (as Cloud Run URL), but requires OIDC token verified at handler entry (`order-status.ts:16-24`). No HMAC middleware on it. Rate limiting is explicitly skipped for `/internal/*` (`index.ts:53,62`).

### Q2: Is OIDC verification mandatory before status update logic runs?

**Yes.** `order-status.ts:16-24` — `verifyPubSubOidcToken()` called at handler start. Checks `Bearer` token, audience (`SERVICE_URL`), email (`PUBSUB_SERVICE_ACCOUNT_EMAIL`). Invalid → 401.

### Q3: Can a normal API key call `/internal/order-status`?

**No.** `hmacAuth()` only applied to orders router (`orders.ts:29`). Internal router has no HMAC middleware — only OIDC.

### Q4: Can any in-scope source path publish arbitrary messages to `TRADING_API_STATUS_TOPIC`?

**No.** Only code publishing to status topic is executor's `TradingApiClient.publishOrderStatusUpdate()`, called from `HodlBondsTrade.publishUpdate()` lifecycle hooks. **No user input reaches this path.** Trading-api publishes to `EXECUTOR_PUBSUB_TOPIC`, not the status topic.

### Q5: Does marking an order `executed` trigger any withdrawal, settlement, crediting, balance update, or user payout?

**No.** `order-status.ts:93-106` only updates `trade_requests` table with `status`, `lastStatusAt`, optionally `txHash`/`executedAt`. Zero code triggers:

- Withdrawal on status change
- User credit
- On-chain transaction
- Webhook/callback
- Vault balance update
- No consumer of `trade_requests.status` for financial logic

### Q6: Is order status only informational, or does another component consume it as financial truth?

**Only informational.** `order-queries.ts` reads order status for display via `GET /v0/orders`. No automated process, webhook, or callback reads `trade_requests.status` for financial operations. The executor works from its own `queue` table — it does NOT check trading-api order status before executing.

### Q7: Can fake `txHash` cause direct fund loss?

**No.** `txHash` stored and returned for display/explorer lookup only. No code uses it for any financial action.

### Q8: Can terminal state prevent correction by the real executor, and is that enough for Critical impact?

**Yes, terminal guard at `order-status.ts:77` would reject real executor's updates.** However:

- Zero financial impact — order status is purely informational (Q5)
- Executor still executes independently from its own queue
- Vault tokens move on-chain regardless of `trade_requests` state
- User's actual trade outcome is determined by on-chain state, not trading-api DB

### Q9: Verdict

**KILL.** Impact is purely UI/accounting confusion — order shows `executed` with fake `txHash` when no execution occurred. No fund movement. Required attacker capability (PubSub IAM or OIDC compromise) is an infrastructure gate. Even if bypassed, impact does not meet Critical threshold.

---

## Final Status

```
╔══════════════════════════════════════════════════════════════╗
║           CANDIDATE VALIDATION PASS 2 — FINAL STATUS        ║
║                                                              ║
║   C4 (Uniswap V4 Simulation No-Op):    KILL                  ║
║     Reason: Uniswap V4 is unreachable — DEX selection        ║
║     logic only produces LFJ/BLACKHOLE. Even if reachable,    ║
║     impact is gas griefing only. Cannot cause fund loss.     ║
║                                                              ║
║   C5 (Status Update State Transition): KILL                  ║
║     Reason: Order status is purely informational — no        ║
║     financial logic consumes it. Impact is UI confusion.     ║
║     Requires PubSub IAM compromise even to reach.            ║
║                                                              ║
║   OVERALL:  NO_REPORTABLE_FINDING_YET                        ║
║                                                              ║
║   No candidate from Pass 2 achieves independently-           ║
║   exploitable Critical impact from source code alone.        ║
╚══════════════════════════════════════════════════════════════╝
```

### Source Evidence Table

| #   | Finding                                   | Key Lines                                                                                                                 | Verdict                                              |
| --- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| C4  | Uniswap V4 simulation no-op               | `dex/uniswap-v4.ts:133-137` — no-op `simulateSwap`                                                                        | **KILL** — unreachable code path                     |
| C4  | DEX selection excludes Uniswap V4         | `dex/index.ts:55` — `primaryDex: "LFJ" \| "BLACKHOLE"`; `dex/index.ts:66-91` — only returns LFJ/Blackhole                 | **KILL** — selection logic never produces UNISWAP_V4 |
| C4  | DB schema excludes Uniswap V4             | `order.ts:72` — `bond.primaryDex === 1 ? "BLACKHOLE" : "LFJ"`; `types/index.ts:25` — `PRIMARY_DEX = ["LFJ", "BLACKHOLE"]` | **KILL** — vault config only stores LFJ/BLACKHOLE    |
| C4  | Balance check uses DB balance             | `order.ts:261-269` — `availableBalance < requiredAmount`                                                                  | Even if stale, only gas griefing                     |
| C4  | `minAmountOut` is server-computed         | `dex/utils.ts:22-27` — 25 bps slippage from quote; `order.ts:121` — from `adapter.getQuote()`                             | **KILL** — not attacker-controlled                   |
| C4  | Oracle validation on mainnet              | `oracle.ts:97` — 3% max deviation from Chainlink                                                                          | Blocks manipulated pool quotes                       |
| C5  | No state transition validation            | `order-status.ts:93-94` — `status: data.status` directly                                                                  | **KILL** — but no financial impact                   |
| C5  | Terminal state guard exists               | `order-status.ts:77` — blocks updates once `executed`/`failed`                                                            | Prevents correction but no fund loss                 |
| C5  | OIDC verification mandatory               | `order-status.ts:16-24` — `verifyPubSubOidcToken()` called at handler start                                               | Infrastructure gate                                  |
| C5  | No financial consumer of status           | `order-queries.ts` — only reads for display                                                                               | **KILL** — pure UI/accounting                        |
| C5  | Executor doesn't check trading-api status | `HodlBondsTrade.ts:84-154` — reads from own `queue` table                                                                 | Independent execution                                |

### Missing Proof Checklist

| #     | Required Proof                                                     | Status                                                                       |
| ----- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| C4-P1 | Demonstrate Uniswap V4 is selected for any vault                   | **IMPOSSIBLE** — code proves it's never selected                             |
| C4-P2 | Demonstrate fund loss from stale DB balance with Uniswap V4        | **IMPOSSIBLE** — code path unreachable; even if reachable, only gas griefing |
| C4-P3 | Demonstrate `minAmountOut = 1` via API                             | **IMPOSSIBLE** — always 99.75% of quote                                      |
| C5-P1 | Demonstrate publishing to TRADING_API_STATUS_TOPIC without GCP IAM | **IMPOSSIBLE FROM SOURCE** — requires infrastructure access                  |
| C5-P2 | Demonstrate fund movement triggered by status change               | **NON-EXISTENT** — no financial consumer of order status                     |

### PoC Required Before Report

None — both candidates are killed at source level. No PoC can rehabilitate them without code changes adding Uniswap V4 support to the DEX selection path, or adding financial logic that consumes order status.

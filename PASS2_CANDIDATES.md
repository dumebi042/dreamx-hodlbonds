# Audit Pass 2: Source-Only Critical Hunting — New Candidate List

> **Target commit:** `c8cf89e38a3ec77941a04bd64cb173434ceffcf8`
> **Status:** Pass 2 — Source-level analysis complete
> **Excluded:** C2 (KILLED), C3 (KILLED), C1 (NEEDS_SOURCE — PubSub IAM gate)
> **Date:** 2026-06-12

---

## CANDIDATE 4 — Uniswap V4 Simulation No-Op: Zero Pre-Flight Validation Enables Undetected Attacks

**Status:** `VALID_CANDIDATE`

**Source evidence:**

- `trading-api/src/services/dex/uniswap-v4.ts:133-137`:

```typescript
simulateSwap(_params: DexSimulateParams): Promise<void> {
    // Uniswap V4 simulation not yet implemented
    console.log("Uniswap V4 swap simulation skipped (not implemented)")
    return Promise.resolve()
}
```

- LFJ and Blackhole both implement full `client.simulateContract` (lfj.ts:175, blackhole.ts:200)
- `dex/types.ts:45` defines the `DexAdapter` interface requiring `simulateSwap`

**Attack path (stale DB balance):**

1. Attacker with valid HMAC API key places a Uniswap V4 order
2. Balance check reads `bond.vaultTokenBalance` from DB (`order.ts:261`)
3. If DB balance is stale (higher than on-chain due to event processing lag), check passes
4. For LFJ/Blackhole: simulation would catch this (on-chain revert)
5. **For Uniswap V4: simulation is a no-op, so stale balance is never validated**
6. Order published to PubSub, executor broadcasts, transaction reverts → **executor pays gas**

**Attack path (incorrect pool config):**

1. If `UniswapV4Adapter.getQuote()` fetches quote from wrong pool (low-liquidity or manipulated pool)
2. Quote is inaccurate but passes oracle validation
3. No simulation to catch the mismatch
4. Executor signs transaction with incorrect `minAmountOut`

**Required attacker capability:** Valid HMAC API key

**Direct Critical impact:** Gas griefing on executor wallets (~0.05-0.15 ETH each). Requires second bug (stale DB balance or wrong pool config) for fund loss.

**Why it meets scope:** Category: Access Control / Broken Authorization — simulation is a security control explicitly disabled for Uniswap V4. The TODO comment confirms it's intentionally not implemented.

**Minimal PoC plan:**

1. Get valid HMAC API key for testnet
2. Place Uniswap V4 order for vault with stale DB balance
3. Confirm order accepted and executor broadcasts (reverting) transaction

**Test required:** Confirm executor broadcasts a transaction for a Uniswap V4 order that would have failed on-chain simulation.

---

## CANDIDATE 5 — Status Update State Transition Validation Missing: Terminal State Can Be Set With Fabricated Timestamp

**Status:** `VALID_CANDIDATE`

**Source evidence:**

- `trading-api/src/routers/internal/order-status.ts:77` — Terminal state guard:

```typescript
if (
	currentRequest.status === "executed" ||
	currentRequest.status === "failed"
) {
	return c.json({ success: true }); // Ignores updates to terminal states
}
```

- `order-status.ts:85-91` — Timestamp ordering:

```typescript
const incomingTimestamp = new Date(data.timestamp);
if (
	currentRequest.lastStatusAt &&
	incomingTimestamp <= currentRequest.lastStatusAt
) {
	return c.json({ success: true }); // Ignores stale
}
```

- `order-status.ts:93-101` — Status value from update, **NO transition validation**:

```typescript
const updateData: Record<string, unknown> = {
	status: data.status, // Directly from attacker-controlled PubSub message!
	lastStatusAt: incomingTimestamp,
};
```

- `schemas/executor.ts:7-13` — `ExecutorStatusUpdateSchema` accepts any status enum value:

```typescript
export const ExecutorStatusUpdateSchema = z.object({
	clientOrderId: ClientOrderIdSchema,
	status: z.enum(["pending", "retry", "executed", "failed"]),
	timestamp: z.string().datetime(),
	txHash: z.string().optional(),
});
```

**No transition rules:** The code accepts `status = "executed"` directly from the update WITHOUT checking if the current state is compatible (e.g., `pending → executed` is accepted same as `submitted → executed`).

**Attack path:**

1. Attacker who can publish to `TRADING_API_STATUS_TOPIC` sends status update:
   - `clientOrderId`: target order
   - `status`: `"executed"`
   - `timestamp`: current ISO time
   - `txHash`: `"0xDEAD...BEEF"` (fake hash)
2. Order transitions: `submitted → executed` with fake `txHash`
3. Terminal state guard at L77 prevents any correction
4. The order is permanently marked `executed` with a fake hash

**Required attacker capability:**

- PubSub publish access to `TRADING_API_STATUS_TOPIC` (IAM gate)
- OR compromised OIDC token

**Direct Critical impact:** Financial fraud — an order can be permanently marked `executed` with fake `txHash`. If the order was for a sell (vault token → stable token), this could be used to claim a trade was executed when it wasn't. Combined with off-chain accounting, this enables withdrawal of funds without actual execution.

**Why it meets scope:** Category 3 (Financial fraud causing fund loss) — false execution state could enable unauthorized withdrawal.

**Minimal PoC plan:**

1. Create an order via POST /v0/orders (status `submitted`)
2. Publish fabricated status update: `{clientOrderId, status: "executed", timestamp: now, txHash: "0xAAAA"}`
3. Verify order is now `executed` with fake hash
4. Verify no correction possible (terminal guard)

**Test required:** Publisher-level access to status topic. If topic is locked down, downgrade to NEEDS_SOURCE.

---

## CANDIDATE 7 — `inputToken` in Executor Calldata Not Validated Against Vault Configuration (PubSub Path)

**Status:** `NEEDS_SOURCE`

**Source evidence:**

- `executor/src/implementations/HodlBondsTrade.ts:124-127` — LFJ calldata:

```typescript
hodlBondsTradeData.inputToken,  // <-- from PubSub message, NOT validated
```

- `executor/src/implementations/HodlBondsTrade.ts:141` — Blackhole calldata (same)
- `HodlBondsTrade.ts:88-93` — `poolAddress` also from PubSub message

**Attack path (requires PubSub IAM bypass):**

1. Attacker publishes to executor PubSub topic directly
2. Sets `inputToken` to a token address the vault holds but at wrong price
3. Executor calls vault's swap function with attacker-controlled `inputToken`
4. Vault transfers tokens based on the manipulated `inputToken`

**Why NEEDS_SOURCE:**

- Attack requires PubSub publish access (same gate as C1)
- Through API flow, `inputToken` is correctly derived from `side` + vault config

**Test required:** Verify PubSub topic IAM bindings. If topic allows non-trading-api publishers, this becomes VALID_CANDIDATE.

---

## KILLED CANDIDATES (Pass 2)

### C6 — Body Already Consumed by BodyLimit Middleware

**KILL** — `c.req.raw.clone()` creates independent body read streams. No conflict between bodyLimit and HMAC auth.

### C8 — Size Field No Upper Bound

**KILL** — Balance check (`availableBalance < requiredAmount`) at `order.ts:265` prevents overflow. `parseUnits` handles large strings correctly.

### C9 — Oracle Validation Skipped on Testnet

**KILL** — Testnet funds have no real value. Per scope: "Testnet bypasses only if bounty/testnet funds in scope."

### C10 — Orphaned `created` Rows on Publish Failure

**KILL** — No financial impact from unpublished orders occupying DB space.

### C11 — `poolAddress` Override (C3 Revisited)

**KILL** — Same as pass 1. Executor wallets hold gas ETH only. No vault tokens at risk.

### C12 — Simulation Account Hardcoded to `EXECUTOR_ADDRESSES[0]`

**KILL** — Both simulation account and execution wallet are derived from same seed phrase. Simulation validates vault swap works for a valid trader. At worst: false-negative sim blocks order, or false-positive passes but execution fails (gas griefing).

### C13 — Replay Protection TOCTOU Race

**KILL** — Two concurrent requests with same `keyId:timestamp` could both pass replay check. But `clientOrderId` UNIQUE constraint prevents duplicate order insertion. If different `clientOrderId`, two independent orders created — no financial consequence.

---

## Summary Table

| #     | Title                                  | Status            | Critical Category                                          |
| ----- | -------------------------------------- | ----------------- | ---------------------------------------------------------- |
| **4** | Uniswap V4 Simulation No-Op            | `VALID_CANDIDATE` | 2 (Transaction tampering) — security control disabled      |
| **5** | Status Update State Transition Missing | `VALID_CANDIDATE` | 3 (Financial fraud) — false execution state                |
| **7** | `inputToken` Not Validated at Executor | `NEEDS_SOURCE`    | 1 (Unauthorized fund transfer) — requires PubSub IAM check |
| 6     | Body consumed by middleware            | `KILL`            | —                                                          |
| 8     | Size field no upper bound              | `KILL`            | —                                                          |
| 9     | Testnet oracle bypass                  | `KILL`            | —                                                          |
| 10    | Orphaned `created` rows                | `KILL`            | —                                                          |
| 11    | `poolAddress` override (C3)            | `KILL`            | —                                                          |
| 12    | Simulation account mismatch            | `KILL`            | —                                                          |
| 13    | Replay TOCTOU                          | `KILL`            | —                                                          |

---

## Combined Status — All Passes

```
╔══════════════════════════════════════════════════════════════╗
║                 AUDIT PASS 2 — FINAL STATUS                  ║
║                                                              ║
║   C4 (Uniswap V4 No-Op):                  VALID_CANDIDATE    ║
║   C5 (Status transition missing):         VALID_CANDIDATE    ║
║   C7 (inputToken manipulation):           NEEDS_SOURCE       ║
║   C1 (Intake zero-trust, from Pass 1):    NEEDS_SOURCE       ║
║   All others:                             KILL               ║
║                                                              ║
║   OVERALL:  NEEDS_MORE_PROOF                                  ║
║                                                              ║
║   Both VALID_CANDIDATES (C4, C5) require additional          ║
║   elements to reach Critical fund loss:                      ║
║   - C4 needs stale DB balance or wrong pool config +         ║
║     Uniswap V4 orders on vaults with real value             ║
║   - C5 needs PubSub status topic IAM or OIDC compromise      ║
║     to forge status updates                                 ║
║                                                              ║
║   No candidate achieves independently-exploitable Critical   ║
║   impact from source code alone.                             ║
╚══════════════════════════════════════════════════════════════╝
```

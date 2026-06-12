# DreamX HODLBonds Audit Findings

> **Target commit:** `c8cf89e38a3ec77941a04bd64cb173434ceffcf8`
> **Date:** 2026-06-12
> **Status:** Candidate findings — not submission-ready until PoC confirmed

---

## Critical Candidates (requires infrastructure verification)

### Finding #1 — Zero Slippage Floor Enables MEV Sandwich Vault Drain via C1

**Severity:** Critical

**Status:** `NEEDS_SOURCE` — exploitability depends on PubSub topic IAM bindings

**Affected files:**

- `dreamx-hodl-bonds-contracts/src/dualTokenVault/DualTokenVault.sol:223-280` — `lbSwapExactInputSingle()`, `blackholeSwapExactInputSingle()`
- `dreamx-hodl-bonds-contracts/src/dex/lfj/LiquidityBookSwap.sol:94-121` — `_lbSwapExactInputSingle()`
- `dreamx-hodl-bonds-contracts/src/dex/blackhole/BlackholeSwap.sol:101-131` — `_blackholeSwapExactInputSingle()`
- `dreamx-hodlbonds-blockchain-executor/apps/executor/src/implementations/HodlBondsTrade.ts:109-148` — executor passes `minAmountOut` from task data
- `dreamx-hodlbonds-blockchain-executor/apps/intake/src/Intake.ts:34` — no app auth on intake (C1)
- `dreamx-hodl-bonds-contracts/test/DualTokenVaultSwapFork.t.sol:208` — test uses `minAmountOut = 1` as valid

**Root Cause:** The DualTokenVault contract's swap functions pass their `_minAmountOut` parameter directly to the DEX router without any on-chain validation floor. The executor's `HodlBondsTrade.ts` takes `minAmountOut` directly from the task data (which originates from PubSub) and passes it unmodified into the calldata. There is no contract-level minimum slippage enforcement.

**Data Flow:**

```
Task Data (PubSub/C1)
    ↓
executor: hodlBondsTradeData.minAmountOut = "1"
    ↓
ethers ABI: contract.lbSwapExactInputSingle(quantity, "1", inputToken, deadline, proof, gasParams)
    ↓
vault: _lbSwapExactInputSingle(amountIn, 1, tokenIn, deadline)
    ↓
vault: IERC20(_tokenIn).forceApprove(router, _amountIn)  ← approves vault tokens
    ↓
vault: router.swapExactTokensForTokens(_amountIn, 1, path, this, _deadline)  ← min=1 wei
    ↓
DEX: returns output >= 1 wei → SUCCESS (any sandwich works)
```

**Attack Path:**

1. Attacker publishes task to executor PubSub topic targeting a vault with `minAmountOut: "1", op: LFJ_EXACT_IN, poolAddress: <real vault>`
2. Executor picks up task, generates valid Merkle proof for its own wallet, signs and broadcasts the swap
3. MEV bot front-runs by manipulating the pool rate (buying output token)
4. Executor's swap executes at the manipulated rate, vault receives near-zero output
5. MEV bot back-runs, selling output token at profit
6. Vault's assets are extracted — bondholder receives significantly less at redemption

**Required Capability:** `pubsub.topics.publish` on `main-intake-HodlBondsTrade` (or stage variant)

**Direct Impact:** Unauthorized vault fund loss through MEV sandwich on executor-signed swaps. The vault holds user tokens; `minAmountOut: 1` allows the DEX router to accept any trade.

**PoC Plan:**

```solidity
// Fork from Avalanche mainnet
// 1. Create vault with real DEX pools
// 2. Publish task via PubSub with minAmountOut=1
// 3. MEV sandwich: front-run + executor swap + back-run
// 4. Assert vault lost value vs without sandwich
```

**Recommendation:** Implement a minimum slippage floor in the vault's swap functions, e.g., `require(_minAmountOut >= _amountIn * MIN_SLIPPAGE_BPS / 10000)`.

---

## Low/Medium Code Quality Issues

### Finding #2 — Dead `UNISWAP_EXACT_IN` Code Path / ABI Mismatch

**Severity:** Medium

**Status:** Code quality — not independently exploitable for Critical impact

**Affected files:**

- `dreamx-hodlbonds-blockchain-executor/apps/executor/src/implementations/HodlBondsTrade.ts:104-116` — `UNISWAP_EXACT_IN` case
- `dreamx-hodlbonds-blockchain-executor/packages/dto/src/model/HodlBondsTrade.ts:30-58` — `HodlBondsTradeDataSchema` with `zeroForOne`

**Root Cause:** The executor has a `UNISWAP_EXACT_IN` case calling `contract["swapExactInputSingle"]` — but the DualTokenVault contract has no function with that name. It only has `lbSwapExactInputSingle` and `blackholeSwapExactInputSingle`. The DTO for this op includes `zeroForOne: boolean` (matching Uniswap V4's pool interface) instead of `inputToken: address` (matching the vault's actual ABI). Any task with `op: UNISWAP_EXACT_IN` fails immediately.

---

### Finding #3 — `forceApprove` Before `_checkTokenAddress` (CEI Violation)

**Severity:** Low

**Status:** Defense-in-depth — not exploitable in practice

**Affected files:**

- `dreamx-hodl-bonds-contracts/src/dex/blackhole/BlackholeSwap.sol:108-114` — approve before check
- `dreamx-hodl-bonds-contracts/src/dex/lfj/LiquidityBookSwap.sol:101-108` — approve before check

**Root Cause:** `IERC20(_tokenIn).forceApprove()` is called BEFORE `_checkTokenAddress(_tokenIn)`. While the EVM reverts undo the approval in the same transaction, this violates checks-effects-interactions ordering. In practice, only token0/token1 pass the check, limiting risk to malicious configurations of these tokens.

---

## Summary

| #   | Finding                                      | Severity | Status           | Requires                |
| --- | -------------------------------------------- | -------- | ---------------- | ----------------------- |
| 1   | Zero slippage floor → MEV vault drain via C1 | Critical | `NEEDS_SOURCE`   | PubSub IAM verification |
| 2   | Dead UNISWAP_EXACT_IN path / ABI mismatch    | Medium   | Code quality     | Code cleanup            |
| 3   | forceApprove before validation               | Low      | Defense-in-depth | Code reorder            |

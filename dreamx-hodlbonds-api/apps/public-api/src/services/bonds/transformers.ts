import type {
  bonds as BondsTable,
  pairs as PairsTable,
  receiptTokenBalances as BalancesTable,
  receiptTokenTransfers as TransfersTable,
  trades as TradesTable,
} from "@hodlbonds-api/db/schema"
import type { Address } from "viem"

import { getToken } from "@/lib/token-cache"
import { getBondState, getDexInfo, getTradeDex } from "@/utils"

import type {
  Bond,
  BondToken,
  ReceiptTokenBalance,
  ReceiptTokenTransfer,
  TokenMetadata,
  TokensMap,
  Trade,
} from "./types"

/**
 * Convert a Date to unix timestamp in seconds.
 */
function toUnixSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000)
}

/**
 * Convert a nullable Date to unix timestamp in seconds.
 */
function toUnixSecondsOrNull(date: Date | null): number | null {
  return date ? toUnixSeconds(date) : null
}

function bigintToString(value: bigint | null): string | null {
  return value?.toString() ?? null
}

/**
 * Build a TokenMetadata object, with fallback for unknown tokens.
 */
export function buildTokenMetadata(chainId: number, address: string): TokenMetadata {
  const token = getToken(chainId, address as Address)
  return token
    ? {
        address: token.address,
        symbol: token.symbol,
        name: token.name,
        decimals: token.decimals,
      }
    : {
        address,
        symbol: "UNKNOWN",
        name: "Unknown Token",
        decimals: 0,
      }
}

/**
 * Build a BondToken object with balance fields.
 *
 * @param chainId - Chain ID for token lookup
 * @param address - Token address
 * @param balance - Current balance
 * @param startingBalance - Starting balance
 * @param frozenBalance - Frozen/reserved balance
 * @param finalBalance - Final balance (null if not settled)
 */
function buildBondToken(
  chainId: number,
  address: string,
  balance: bigint,
  startingBalance: bigint,
  frozenBalance: bigint,
  finalBalance: bigint | null,
): BondToken {
  const metadata = buildTokenMetadata(chainId, address)
  const availableBalance = balance - frozenBalance

  return {
    ...metadata,
    balance: balance.toString(),
    startingBalance: startingBalance.toString(),
    frozenBalance: frozenBalance.toString(),
    availableBalance: availableBalance.toString(),
    finalBalance: finalBalance?.toString() ?? null,
  }
}

type BondRow = typeof BondsTable.$inferSelect
type PairRow = typeof PairsTable.$inferSelect
type TradeRow = typeof TradesTable.$inferSelect
type BalanceRow = typeof BalancesTable.$inferSelect
type TransferRow = typeof TransfersTable.$inferSelect

/**
 * Transform a bond database row into the API response format.
 * Assumes bond is complete (isComplete = true).
 */
export function transformBond(row: BondRow, pair: PairRow | null): Bond {
  // Calculate frozen vault token balance: startingBalance * reserveRatio / 10000
  const startingVaultTokenBalance = row.startingVaultTokenBalance!
  const reserveRatio = BigInt(row.reserveRatio!)
  const frozenVaultTokenBalance = (startingVaultTokenBalance * reserveRatio) / 10000n

  return {
    chainId: row.chainId,
    vaultAddress: row.vaultAddress,
    vaultId: row.vaultId!,

    vaultToken: buildBondToken(
      row.chainId,
      row.vaultTokenAddress,
      row.vaultTokenBalance!,
      startingVaultTokenBalance,
      frozenVaultTokenBalance,
      row.finalVaultTokenBalance,
    ),
    stableToken: buildBondToken(
      row.chainId,
      row.stableTokenAddress,
      row.stableTokenBalance!,
      row.startingStableTokenBalance!,
      0n, // Stable token has no frozen balance
      row.finalStableTokenBalance,
    ),

    issuer: row.issuer,
    createdAt: toUnixSeconds(row.blockTimestamp),
    bondPrice: row.bondPrice!.toString(),
    factoryAddress: row.factoryAddress!,
    receiptTokenAddress: row.receiptTokenAddress!,
    vaultState: getBondState(row.vaultState!, toUnixSeconds(row.tradingEndsAt!)),
    reserveRatio: row.reserveRatio!,
    managementFee: row.managementFee!,
    managementFeePaid: bigintToString(row.managementFeePaid),
    performanceFee: row.performanceFee!,
    performanceFeePaid: bigintToString(row.performanceFeePaid),

    tradingPeriodDuration: row.tradingPeriodDuration!,
    tradingEndsAt: toUnixSeconds(row.tradingEndsAt!),

    // DEX configuration (LFJ uses tokenPairAddress, Blackhole uses pairAddress)
    ...getDexInfo(row.primaryDex!, pair?.tokenPairAddress ?? null, pair?.pairAddress ?? null),

    balanceUpdatedAt: toUnixSecondsOrNull(row.balanceBlockTimestamp),
    lastSwapAt: toUnixSecondsOrNull(row.lastSwapBlockTimestamp),
    settledAt: toUnixSecondsOrNull(row.settledBlockTimestamp),
    settledBy: row.settledBy,
  }
}

/**
 * Transform a trade database row into the API response format.
 */
export function transformTrade(row: TradeRow, pair: PairRow | null): Trade {
  return {
    timestamp: toUnixSeconds(row.blockTimestamp),
    dex: getTradeDex(row.routerAddress, pair),
    tokenIn: row.tokenIn,
    tokenOut: row.tokenOut,
    amountIn: row.amountIn.toString(),
    amountOut: row.amountOut.toString(),
    tokenInBalance: row.tokenInBalance.toString(),
    tokenOutBalance: row.tokenOutBalance.toString(),
  }
}

/**
 * Build a tokens lookup map from bond and trades.
 * Keys are checksummed addresses.
 */
export function buildTokensMap(
  chainId: number,
  vaultTokenAddress: string,
  stableTokenAddress: string,
  trades: TradeRow[],
): TokensMap {
  const tokens: TokensMap = {}

  // Add vault and stable tokens
  // oxlint-disable-next-line unicorn/no-immediate-mutation
  tokens[vaultTokenAddress] = buildTokenMetadata(chainId, vaultTokenAddress)
  tokens[stableTokenAddress] = buildTokenMetadata(chainId, stableTokenAddress)

  // Add any unique tokens from trades (e.g., wrapped native)
  for (const trade of trades) {
    if (!tokens[trade.tokenIn]) {
      tokens[trade.tokenIn] = buildTokenMetadata(chainId, trade.tokenIn)
    }
    if (!tokens[trade.tokenOut]) {
      tokens[trade.tokenOut] = buildTokenMetadata(chainId, trade.tokenOut)
    }
  }

  return tokens
}

/**
 * Transform a balance database row into the API response format.
 */
export function transformBalance(row: BalanceRow): ReceiptTokenBalance {
  return {
    lastUpdatedAt: toUnixSeconds(row.lastUpdateBlockTimestamp),
    ownerAddress: row.ownerAddress,
    balance: row.balance.toString(),
  }
}

/**
 * Transform a transfer database row into the API response format.
 */
export function transformTransfer(row: TransferRow): ReceiptTokenTransfer {
  return {
    timestamp: toUnixSeconds(row.blockTimestamp),
    type: row.type,
    from: row.from,
    to: row.to,
    amount: row.amount.toString(),
  }
}

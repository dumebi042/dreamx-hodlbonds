import type { Address } from "viem"

import { formatUnits } from "viem"

import type { TokenInfo } from "@/lib/token-cache"
import type { TokenDetails } from "@/types"

/**
 * Build TokenDetails for a vault token (has frozen balance based on reserve ratio).
 */
export function buildVaultTokenDetails(
  tokenInfo: TokenInfo,
  balance: bigint,
  startingBalance: bigint,
  reserveRatio: number,
): TokenDetails {
  const reserveRatioBigInt = BigInt(reserveRatio)
  const frozenBalance = (startingBalance * reserveRatioBigInt) / 10000n
  const availableBalance = balance - frozenBalance

  return {
    address: tokenInfo.address as Address,
    name: tokenInfo.name,
    symbol: tokenInfo.symbol,
    decimals: tokenInfo.decimals,
    balance: formatUnits(balance, tokenInfo.decimals),
    startingBalance: formatUnits(startingBalance, tokenInfo.decimals),
    frozenBalance: formatUnits(frozenBalance, tokenInfo.decimals),
    availableBalance: formatUnits(availableBalance, tokenInfo.decimals),
  }
}

/**
 * Build TokenDetails for a stable token (no frozen balance).
 */
export function buildStableTokenDetails(
  tokenInfo: TokenInfo,
  balance: bigint,
  startingBalance: bigint,
): TokenDetails {
  return {
    address: tokenInfo.address as Address,
    name: tokenInfo.name,
    symbol: tokenInfo.symbol,
    decimals: tokenInfo.decimals,
    balance: formatUnits(balance, tokenInfo.decimals),
    startingBalance: formatUnits(startingBalance, tokenInfo.decimals),
    frozenBalance: "0",
    availableBalance: formatUnits(balance, tokenInfo.decimals),
  }
}

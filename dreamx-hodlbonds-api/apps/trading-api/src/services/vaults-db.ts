import type { ChainId } from "@hodlbonds-api/blockchain"
import type { Address } from "viem"

import { getDb } from "@hodlbonds-api/db"
import { bonds, tradeRequests } from "@hodlbonds-api/db/schema"
import { and, desc, eq, gt } from "drizzle-orm"

import type { Vault, VaultsResponse } from "@/types"

import { errors } from "@/lib/errors"
import { getToken, type TokenInfo } from "@/lib/token-cache"
import { VaultsResponseSchema } from "@/schemas"
import { primaryDexToString, vaultStateToString } from "@/types"

import {
  getBondState,
  buildVaultTokenDetails,
  buildStableTokenDetails,
  formatOrderResponse,
  toUnixSeconds,
  toUnixSecondsOrNull,
} from "./utils"

const TRADING_STATE = 1

/**
 * Fetches active vaults from the database.
 * Returns vaults that are in TRADING or HARVESTING state.
 */
export async function vaultsDbService({ chainId }: { chainId: ChainId }): Promise<VaultsResponse> {
  const db = getDb()

  // Query for active bonds:
  // - isComplete = true (has all required data)
  // - vaultState = 1 (TRADING on chain)
  // - tradingEndsAt > now (excludes matured but unclaimed bonds)
  const results = await db.query.bonds.findMany({
    where: and(
      eq(bonds.chainId, chainId),
      eq(bonds.isComplete, true),
      eq(bonds.vaultState, TRADING_STATE),
      gt(bonds.tradingEndsAt, new Date()),
    ),
    with: {
      pair: true,
      tradeRequests: {
        orderBy: [desc(tradeRequests.createdAt)],
        limit: 1,
      },
    },
  })

  if (results.length === 0) {
    return []
  }

  // Collect unique token addresses and batch lookup from cache
  const tokenAddresses = new Set<string>()
  for (const bond of results) {
    tokenAddresses.add(bond.vaultTokenAddress)
    tokenAddresses.add(bond.stableTokenAddress)
  }

  const tokenCache = new Map<string, TokenInfo>()
  for (const address of tokenAddresses) {
    const token = getToken(chainId, address as Address)
    if (!token) {
      throw errors.internal(`Token cache miss for ${address} on chain ${chainId}`)
    }
    tokenCache.set(address, token)
  }

  const vaults: Vault[] = []

  for (const bond of results) {
    if (!bond.pair) {
      console.error(`Bond ${bond.vaultAddress} missing pair data, skipping`)
      continue
    }

    if (
      bond.vaultId === null ||
      bond.bondPrice === null ||
      bond.reserveRatio === null ||
      bond.tradingPeriodDuration === null ||
      bond.tradingEndsAt === null ||
      bond.primaryDex === null ||
      bond.vaultState === null ||
      bond.startingVaultTokenBalance === null ||
      bond.startingStableTokenBalance === null ||
      bond.vaultTokenBalance === null ||
      bond.stableTokenBalance === null
    ) {
      console.error(
        `Incomplete bond data for vault ${bond.vaultAddress} despite isComplete=true, skipping`,
      )
      continue
    }

    const vaultTokenInfo = tokenCache.get(bond.vaultTokenAddress)!
    const stableTokenInfo = tokenCache.get(bond.stableTokenAddress)!

    const vaultToken = buildVaultTokenDetails(
      vaultTokenInfo,
      bond.vaultTokenBalance,
      bond.startingVaultTokenBalance,
      bond.reserveRatio,
    )

    const stableToken = buildStableTokenDetails(
      stableTokenInfo,
      bond.stableTokenBalance,
      bond.startingStableTokenBalance,
    )

    const tradingEndsAt = toUnixSeconds(bond.tradingEndsAt)
    const vaultState = getBondState(vaultStateToString(bond.vaultState), BigInt(tradingEndsAt))
    const lastTradeRequest = bond.tradeRequests[0]
      ? formatOrderResponse(bond.tradeRequests[0])
      : null

    vaults.push({
      vaultId: bond.vaultId,
      vaultAddress: bond.vaultAddress as Address,
      vaultState,
      createdBy: bond.issuer as Address,
      createdAt: toUnixSeconds(bond.blockTimestamp),
      tradingPeriodDuration: bond.tradingPeriodDuration,
      tradingEndsAt,
      lastTradedAt: toUnixSecondsOrNull(bond.lastSwapBlockTimestamp),
      bondPrice: bond.bondPrice.toString(),
      reserveRatio: bond.reserveRatio,
      primaryDex: primaryDexToString(bond.primaryDex),
      vaultToken,
      stableToken,
      lastTradeRequest,
    })
  }

  const parsed = VaultsResponseSchema.safeParse(vaults)
  if (!parsed.success) {
    console.error("VaultsResponseSchema validation error for DB data:", parsed.error)
    throw errors.internal("Invalid vaults data")
  }

  return parsed.data
}

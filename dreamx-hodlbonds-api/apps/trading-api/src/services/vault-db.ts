import type { ChainId } from "@hodlbonds-api/blockchain"
import type { Address } from "viem"

import { getDb } from "@hodlbonds-api/db"
import { bonds, tradeRequests } from "@hodlbonds-api/db/schema"
import { and, desc, eq } from "drizzle-orm"

import type { Vault } from "@/types"

import { errors } from "@/lib/errors"
import { getToken } from "@/lib/token-cache"
import { VaultSchema } from "@/schemas"
import { primaryDexToString, vaultStateToString } from "@/types"

import {
  getBondState,
  buildVaultTokenDetails,
  buildStableTokenDetails,
  formatOrderResponse,
  toUnixSeconds,
  toUnixSecondsOrNull,
} from "./utils"

/**
 * Fetches vault data from the database.
 */
export async function vaultDbService({
  chainId,
  address,
}: {
  chainId: ChainId
  address: Address
}): Promise<Vault> {
  const db = getDb()

  const bond = await db.query.bonds.findFirst({
    where: and(
      eq(bonds.chainId, chainId),
      eq(bonds.vaultAddress, address),
      eq(bonds.isComplete, true),
    ),
    with: {
      pair: true,
      tradeRequests: {
        orderBy: [desc(tradeRequests.createdAt)],
        limit: 1,
      },
    },
  })

  if (!bond || !bond.pair) {
    throw errors.notFound("Vault", `${chainId}:${address}`)
  }

  const vaultTokenInfo = getToken(chainId, bond.vaultTokenAddress as Address)
  const stableTokenInfo = getToken(chainId, bond.stableTokenAddress as Address)

  if (!vaultTokenInfo || !stableTokenInfo) {
    throw errors.internal(
      `Token cache miss for vault ${address}: vaultToken=${bond.vaultTokenAddress}, stableToken=${bond.stableTokenAddress}`,
    )
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
    throw errors.internal(`Incomplete bond data for vault ${address} despite isComplete=true`)
  }

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
  const lastTradeRequest = bond.tradeRequests[0] ? formatOrderResponse(bond.tradeRequests[0]) : null

  const result: Vault = {
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
  }

  const parsed = VaultSchema.safeParse(result)
  if (!parsed.success) {
    console.error("VaultSchema validation error for DB data:", parsed.error)
    throw errors.internal("Invalid vault data")
  }

  return parsed.data
}

import { getDb } from "@hodlbonds-api/db"
import { bonds, receiptTokenTransfers, trades } from "@hodlbonds-api/db/schema"
import { and, asc, eq } from "drizzle-orm"

import { errors } from "@/lib/errors"

import type { BondDetailResponse, GetBondParams } from "./types"

import {
  buildTokensMap,
  transformBalance,
  transformBond,
  transformTrade,
  transformTransfer,
} from "./transformers"

/**
 * Get a single bond by chainId and vaultAddress, including all related data.
 *
 * Uses Drizzle relational queries to fetch bond with all related data.
 * Only returns complete bonds (isComplete = true).
 */
export async function getBond(params: GetBondParams): Promise<BondDetailResponse> {
  const { chainId, vaultAddress } = params
  const db = getDb()

  const result = await db.query.bonds.findFirst({
    where: and(
      eq(bonds.chainId, chainId),
      eq(bonds.vaultAddress, vaultAddress),
      eq(bonds.isComplete, true),
    ),
    with: {
      pair: true,
      trades: {
        orderBy: [asc(trades.blockTimestamp)],
      },
      owners: true,
      transfers: {
        orderBy: [asc(receiptTokenTransfers.blockTimestamp)],
      },
    },
  })

  if (!result) {
    throw errors.notFound("Bond", `${chainId}:${vaultAddress}`)
  }

  return {
    bond: transformBond(result, result.pair),
    tokens: buildTokensMap(
      result.chainId,
      result.vaultTokenAddress,
      result.stableTokenAddress,
      result.trades,
    ),
    trades: result.trades.map((t) => transformTrade(t, result.pair)),
    balances: result.owners.map((b) => transformBalance(b)),
    transfers: result.transfers.map((t) => transformTransfer(t)),
  }
}

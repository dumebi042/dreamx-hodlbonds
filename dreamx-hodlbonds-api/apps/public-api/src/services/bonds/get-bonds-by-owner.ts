import { getDb } from "@hodlbonds-api/db"
import { receiptTokenBalances, receiptTokenTransfers, trades } from "@hodlbonds-api/db/schema"
import { and, asc, eq, gt } from "drizzle-orm"

import type { BondsByOwnerResponse, GetBondsByOwnerParams, OwnerBond, TokensMap } from "./types"

import {
  buildTokenMetadata,
  transformBond,
  transformTrade,
  transformTransfer,
} from "./transformers"

/**
 * Get all bonds owned by a specific address (chain-agnostic).
 *
 * Uses Drizzle relational queries to fetch balances with nested bond data.
 * Filters for complete bonds and non-zero balances.
 */
export async function getBondsByOwner(
  params: GetBondsByOwnerParams,
): Promise<BondsByOwnerResponse> {
  const { ownerAddress } = params
  const db = getDb()

  // Fetch all balances for this owner with nested bond data
  const balancesWithBonds = await db.query.receiptTokenBalances.findMany({
    where: and(
      eq(receiptTokenBalances.ownerAddress, ownerAddress),
      gt(receiptTokenBalances.balance, 0n),
    ),
    with: {
      bond: {
        with: {
          pair: true,
          trades: {
            orderBy: [asc(trades.blockTimestamp)],
          },
          transfers: {
            orderBy: [asc(receiptTokenTransfers.blockTimestamp)],
          },
        },
      },
    },
  })

  if (balancesWithBonds.length === 0) {
    return {
      owner: ownerAddress,
      tokens: {},
      bonds: [],
    }
  }

  // Filter for complete bonds
  const completeBonds = balancesWithBonds.filter((b) => b.bond?.isComplete === true)

  // Build unified tokens map across all bonds
  const tokens: TokensMap = {}
  for (const balanceRow of completeBonds) {
    const bond = balanceRow.bond

    // Add vault and stable tokens
    if (!tokens[bond.vaultTokenAddress]) {
      tokens[bond.vaultTokenAddress] = buildTokenMetadata(bond.chainId, bond.vaultTokenAddress)
    }
    if (!tokens[bond.stableTokenAddress]) {
      tokens[bond.stableTokenAddress] = buildTokenMetadata(bond.chainId, bond.stableTokenAddress)
    }

    // Add any unique tokens from trades (e.g., wrapped native)
    for (const trade of bond.trades) {
      if (!tokens[trade.tokenIn]) {
        tokens[trade.tokenIn] = buildTokenMetadata(bond.chainId, trade.tokenIn)
      }
      if (!tokens[trade.tokenOut]) {
        tokens[trade.tokenOut] = buildTokenMetadata(bond.chainId, trade.tokenOut)
      }
    }
  }

  // Transform bonds
  const bondsData: OwnerBond[] = completeBonds.map((balanceRow) => {
    const bond = balanceRow.bond

    return {
      bond: transformBond(bond, bond.pair),
      ownerBalance: balanceRow.balance.toString(),
      trades: bond.trades.map((t) => transformTrade(t, bond.pair)),
      transfers: bond.transfers.map((t) => transformTransfer(t)),
    }
  })

  return {
    owner: ownerAddress,
    bonds: bondsData,
    tokens,
  }
}

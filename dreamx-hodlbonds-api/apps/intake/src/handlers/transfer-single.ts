import type { Schema } from "@hodlbonds-api/db/schema/index"
import type { ExtractTablesWithRelations } from "drizzle-orm"
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres"
import type { PgTransaction } from "drizzle-orm/pg-core"

import { getDb } from "@hodlbonds-api/db"
import { receiptTokenBalances, receiptTokenTransfers } from "@hodlbonds-api/db/schema/index"
import { and, eq, sql } from "drizzle-orm"
import { getAddress, zeroAddress } from "viem"

import type { DecodedLog, TransferSingleEvent } from "../types/events"

// =============================================================================
// Types
// =============================================================================

type TransferType = "transfer" | "mint" | "burn" | "marketplace" | "loan"
type EscrowType = "marketplace" | "loan"
type Transaction = PgTransaction<NodePgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>

export interface ProcessTransferParams {
  tx: Transaction
  chainId: number
  txHash: string
  logIndex: number
  blockNumber: number
  blockTimestamp: Date
  receiptTokenAddress: `0x${string}`
  tokenId: number
  from: `0x${string}`
  to: `0x${string}`
  value: bigint
}

// =============================================================================
// Escrow Address Configuration
// =============================================================================

/**
 * Per-chain configuration of escrow contract addresses.
 * Transfers to/from these addresses are custody changes, not ownership changes.
 * Keys must be checksummed addresses (use getAddress() to generate).
 */
export const ESCROW_ADDRESSES: Record<number, Record<string, EscrowType>> = {
  // Avalanche
  43114: {
    "0x1111111111111111111111111111111111111111": "marketplace", // TODO: Replace with real address
    "0x2222222222222222222222222222222222222222": "loan", // TODO: Replace with real address
  },
  // Test chain
  1337: {
    "0x3333333333333333333333333333333333333333": "marketplace",
    "0x4444444444444444444444444444444444444444": "loan",
  },
  // Add other chains as needed
}

// =============================================================================
// Transfer Type Helpers
// =============================================================================

/**
 * Check if an address is an escrow contract.
 * @returns The escrow type if address is escrow, undefined otherwise
 */
function getEscrowType(chainId: number, address: string): EscrowType | undefined {
  return ESCROW_ADDRESSES[chainId]?.[getAddress(address)]
}

/**
 * Determine the transfer type based on from/to addresses.
 * Priority: mint > burn > escrow > transfer
 */
function getTransferType(chainId: number, from: string, to: string): TransferType {
  // Mint: from zero address
  if (from === zeroAddress) {
    return "mint"
  }

  // Burn: to zero address
  if (to === zeroAddress) {
    return "burn"
  }

  // Check for escrow involvement (either direction)
  const fromEscrow = getEscrowType(chainId, from)
  if (fromEscrow) {
    return fromEscrow
  }

  const toEscrow = getEscrowType(chainId, to)
  if (toEscrow) {
    return toEscrow
  }

  return "transfer"
}

/**
 * Check if a transfer type is an escrow transfer (custody change, not ownership).
 * Escrow transfers are recorded but don't update balances.
 */
function isEscrowTransfer(transferType: TransferType): boolean {
  return transferType === "marketplace" || transferType === "loan"
}

// =============================================================================
// Custom Errors
// =============================================================================

/**
 * Error thrown when a transfer event references a 'from' address
 * that has no existing balance entry (and isn't a mint).
 * This indicates incomplete historical data sync.
 */
export class MissingBalanceError extends Error {
  constructor(
    public readonly chainId: number,
    public readonly receiptTokenAddress: string,
    public readonly tokenId: number,
    public readonly ownerAddress: string,
    public readonly txHash: string,
  ) {
    super(
      `Missing balance entry for ${ownerAddress} on token ${receiptTokenAddress}:${tokenId} (chain ${chainId}). ` +
        `Cannot process transfer ${txHash}. This may indicate incomplete historical sync.`,
    )
    this.name = "MissingBalanceError"
  }
}

// =============================================================================
// Core Transfer Processing
// =============================================================================

/**
 * Process a single transfer within a transaction context.
 * This is the shared logic used by both TransferSingle and TransferBatch handlers.
 *
 * 1. Always inserts a record into receipt_token_transfers
 * 2. For mint/burn/transfer types only: updates receipt_token_balances
 *
 * Escrow transfers (marketplace/loan) are recorded but don't update balances.
 * Those contracts emit their own events that determine economic ownership.
 */
export async function processTransfer(params: ProcessTransferParams): Promise<void> {
  const {
    tx,
    chainId,
    txHash,
    logIndex,
    blockNumber,
    blockTimestamp,
    receiptTokenAddress,
    tokenId,
    from,
    to,
    value,
  } = params

  const transferType = getTransferType(chainId, from, to)

  // 1. Always insert transfer record
  await tx.insert(receiptTokenTransfers).values({
    chainId,
    txHash,
    logIndex,
    blockNumber,
    blockTimestamp,
    type: transferType,
    receiptTokenAddress,
    tokenId,
    from,
    to,
    amount: value,
  })

  // 2. Escrow transfers don't update balances - those contracts emit their own events
  if (isEscrowTransfer(transferType)) {
    return
  }

  // 3. Update 'from' balance (subtract) - skip for mints
  if (transferType !== "mint") {
    // Fetch existing balance
    const [existingFromBalance] = await tx
      .select()
      .from(receiptTokenBalances)
      .where(
        and(
          eq(receiptTokenBalances.chainId, chainId),
          eq(receiptTokenBalances.receiptTokenAddress, receiptTokenAddress),
          eq(receiptTokenBalances.tokenId, tokenId),
          eq(receiptTokenBalances.ownerAddress, from),
        ),
      )
      .limit(1)

    if (!existingFromBalance) {
      throw new MissingBalanceError(chainId, receiptTokenAddress, tokenId, from, txHash)
    }

    const newFromBalance = existingFromBalance.balance - value

    if (newFromBalance <= 0n) {
      // Delete the balance entry
      await tx
        .delete(receiptTokenBalances)
        .where(
          and(
            eq(receiptTokenBalances.chainId, chainId),
            eq(receiptTokenBalances.receiptTokenAddress, receiptTokenAddress),
            eq(receiptTokenBalances.tokenId, tokenId),
            eq(receiptTokenBalances.ownerAddress, from),
          ),
        )
    } else if (existingFromBalance.lastUpdateBlockNumber < blockNumber) {
      // Update balance and timestamps (newer event)
      await tx
        .update(receiptTokenBalances)
        .set({
          balance: newFromBalance,
          lastUpdateBlockNumber: blockNumber,
          lastUpdateBlockTimestamp: blockTimestamp,
        })
        .where(
          and(
            eq(receiptTokenBalances.chainId, chainId),
            eq(receiptTokenBalances.receiptTokenAddress, receiptTokenAddress),
            eq(receiptTokenBalances.tokenId, tokenId),
            eq(receiptTokenBalances.ownerAddress, from),
          ),
        )
    } else {
      // Only update balance, not timestamps (out-of-order event)
      await tx
        .update(receiptTokenBalances)
        .set({ balance: newFromBalance })
        .where(
          and(
            eq(receiptTokenBalances.chainId, chainId),
            eq(receiptTokenBalances.receiptTokenAddress, receiptTokenAddress),
            eq(receiptTokenBalances.tokenId, tokenId),
            eq(receiptTokenBalances.ownerAddress, from),
          ),
        )
    }
  }

  // 4. Update 'to' balance (add) - skip for burns
  if (transferType !== "burn") {
    await tx
      .insert(receiptTokenBalances)
      .values({
        chainId,
        receiptTokenAddress,
        tokenId,
        ownerAddress: to,
        balance: value,
        lastUpdateBlockNumber: blockNumber,
        lastUpdateBlockTimestamp: blockTimestamp,
      })
      .onConflictDoUpdate({
        target: [
          receiptTokenBalances.chainId,
          receiptTokenBalances.receiptTokenAddress,
          receiptTokenBalances.tokenId,
          receiptTokenBalances.ownerAddress,
        ],
        set: {
          // Always add to balance
          balance: sql`${receiptTokenBalances.balance} + ${value}`,
          // Only update timestamps if this event is newer
          lastUpdateBlockNumber: sql`
            CASE 
              WHEN ${blockNumber} > ${receiptTokenBalances.lastUpdateBlockNumber} 
              THEN ${blockNumber} 
              ELSE ${receiptTokenBalances.lastUpdateBlockNumber} 
            END
          `,
          lastUpdateBlockTimestamp: sql`
            CASE 
              WHEN ${blockNumber} > ${receiptTokenBalances.lastUpdateBlockNumber} 
              THEN ${blockTimestamp}::timestamptz 
              ELSE ${receiptTokenBalances.lastUpdateBlockTimestamp} 
            END
          `,
        },
      })
  }
}

// =============================================================================
// TransferSingle Handler
// =============================================================================

/**
 * Handles TransferSingle ERC1155 events.
 * Delegates to processTransfer for the actual work.
 */
export async function handleTransferSingle(event: DecodedLog<TransferSingleEvent>): Promise<void> {
  const {
    args,
    chainId,
    transactionHash,
    blockNumber,
    blockTimestamp: blockTs,
    logIndex,
    address,
  } = event
  const { from: fromRaw, to: toRaw, id, value } = args

  if (blockNumber === null || blockTs === undefined || logIndex === null) {
    throw new Error(
      `Missing required event metadata for TransferSingle event ${transactionHash}: ` +
        `blockNumber=${blockNumber}, blockTimestamp=${blockTs}, logIndex=${logIndex}`,
    )
  }

  const blockTimestamp = new Date(Number(blockTs) * 1000)

  const from = getAddress(fromRaw)
  const to = getAddress(toRaw)
  const receiptTokenAddress = getAddress(address)

  const db = getDb()
  await db.transaction(async (tx) => {
    await processTransfer({
      tx,
      chainId,
      txHash: transactionHash,
      logIndex,
      blockNumber: Number(blockNumber),
      blockTimestamp,
      receiptTokenAddress,
      tokenId: Number(id),
      from,
      to,
      value,
    })
  })
}

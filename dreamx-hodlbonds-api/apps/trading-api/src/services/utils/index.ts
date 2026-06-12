import type { tradeRequests } from "@hodlbonds-api/db/schema"

import type { OrderSide, OrderStatusResponse } from "@/types"

export * from "./get-bond-state"
export * from "./token-details"

/**
 * Convert a Date to unix timestamp in seconds.
 */
export function toUnixSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000)
}

/**
 * Convert a nullable Date to unix timestamp in seconds.
 */
export function toUnixSecondsOrNull(date: Date | null): number | null {
  return date ? toUnixSeconds(date) : null
}

/**
 * Type for trade request rows from the database.
 */
export type TradeRequestRow = typeof tradeRequests.$inferSelect

/**
 * Formats a trade request database row into the API response format.
 */
export function formatOrderResponse(order: TradeRequestRow): OrderStatusResponse {
  return {
    clientOrderId: order.clientOrderId,
    chainId: order.chainId,
    vaultAddress: order.vaultAddress,
    side: order.side as OrderSide,
    size: order.size,
    status: order.status,
    txHash: order.txHash,
    createdAt: order.createdAt.toISOString(),
    lastStatusAt: order.lastStatusAt?.toISOString() ?? null,
    expiresAt: order.expiresAt?.toISOString() ?? null,
    executedAt: order.executedAt?.toISOString() ?? null,
  }
}

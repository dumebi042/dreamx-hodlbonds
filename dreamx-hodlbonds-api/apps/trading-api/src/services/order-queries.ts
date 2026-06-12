import { getDb } from "@hodlbonds-api/db"
import { tradeRequests } from "@hodlbonds-api/db/schema"
import { and, count, desc, eq, gte, lte } from "drizzle-orm"

import type { ListOrdersQuery, OrderListResponse, OrderStatusResponse } from "@/types"

import { errors } from "@/lib/errors"
import { OrderListResponseSchema, OrderStatusResponseSchema } from "@/schemas"
import { formatOrderResponse } from "@/services/utils"

/**
 * Retrieves a single order by client order ID.
 */
export async function getOrderStatusService(clientOrderId: string): Promise<OrderStatusResponse> {
  const db = getDb()
  const order = await db.query.tradeRequests.findFirst({
    where: eq(tradeRequests.clientOrderId, clientOrderId),
  })

  if (!order) {
    throw errors.notFound("Order", clientOrderId)
  }

  const result = formatOrderResponse(order)
  const parsed = OrderStatusResponseSchema.safeParse(result)

  if (!parsed.success) {
    console.error("OrderStatusResponseSchema validation error:", parsed.error)
    throw errors.internal("Invalid order data")
  }

  return parsed.data
}

/**
 * Lists orders with optional filters and pagination.
 */
export async function listOrdersService({
  chainId,
  vaultAddress,
  status,
  createdAfter,
  createdBefore,
  limit,
  offset,
}: ListOrdersQuery): Promise<OrderListResponse> {
  const db = getDb()

  const whereClause = and(
    chainId ? eq(tradeRequests.chainId, Number(chainId)) : undefined,
    vaultAddress ? eq(tradeRequests.vaultAddress, vaultAddress) : undefined,
    status ? eq(tradeRequests.status, status) : undefined,
    createdAfter ? gte(tradeRequests.createdAt, new Date(createdAfter)) : undefined,
    createdBefore ? lte(tradeRequests.createdAt, new Date(createdBefore)) : undefined,
  )

  const [orders, countResult] = await Promise.all([
    db.query.tradeRequests.findMany({
      where: whereClause,
      orderBy: [desc(tradeRequests.createdAt)],
      limit,
      offset,
    }),
    db.select({ total: count() }).from(tradeRequests).where(whereClause),
  ])

  const total = countResult[0]?.total ?? 0

  const result: OrderListResponse = {
    orders: orders.map((o) => formatOrderResponse(o)),
    pagination: { limit, offset, count: orders.length, total },
  }

  const parsed = OrderListResponseSchema.safeParse(result)

  if (!parsed.success) {
    console.error("OrderListResponseSchema validation error:", parsed.error)
    throw errors.internal("Invalid order list data")
  }

  return parsed.data
}

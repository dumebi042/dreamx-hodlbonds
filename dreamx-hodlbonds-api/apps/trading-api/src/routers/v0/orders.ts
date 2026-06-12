import type { ChainId } from "@hodlbonds-api/blockchain"

import { createRoute, OpenAPIHono } from "@hono/zod-openapi"

import { errors } from "@/lib/errors"
import { hmacAuth } from "@/middleware"
import {
  ChainIdParamsSchema,
  CreateOrderBodySchema,
  CreateOrderResponseSchema,
  GetOrderParamsSchema,
  ListOrdersQuerySchema,
  OrderAuthHeadersSchema,
  OrderListResponseSchema,
  OrderStatusResponseSchema,
} from "@/schemas"
import { orderService } from "@/services/order"
import { getOrderStatusService, listOrdersService } from "@/services/order-queries"

export const ordersRouter = new OpenAPIHono({
  defaultHook: (result) => {
    if (!result.success) {
      throw errors.badRequest("Invalid input", result.error)
    }
  },
})

// Apply HMAC auth to all order routes
ordersRouter.use("/*", hmacAuth())

// POST /v0/orders/{chainId}
ordersRouter.openapi(
  createRoute({
    method: "post",
    path: "/{chainId}",
    summary: "Place order",
    description: "Places a new buy or sell order for execution.",
    tags: ["Orders"],
    request: {
      headers: OrderAuthHeadersSchema,
      params: ChainIdParamsSchema,
      body: {
        content: {
          "application/json": {
            schema: CreateOrderBodySchema,
          },
        },
        required: true,
      },
    },
    responses: {
      201: {
        content: {
          "application/json": {
            schema: CreateOrderResponseSchema,
          },
        },
        description: "Order placed successfully.",
      },
      400: {
        description: "Invalid request body or unsupported trading symbol.",
      },
      401: {
        description: "Authentication failed (invalid or missing HMAC signature).",
      },
      422: {
        description: "Unprocessable entity (e.g., insufficient liquidity or balance).",
      },
      429: {
        description: "Rate limit exceeded.",
      },
      503: {
        description: "Trading service temporarily unavailable.",
      },
    },
  }),
  async (c) => {
    const { chainId } = c.req.valid("param")
    const body = c.req.valid("json")
    const result = await orderService(Number(chainId) as ChainId, body)

    return c.json(result, 201)
  },
)

// GET /v0/orders/{clientOrderId}
ordersRouter.openapi(
  createRoute({
    method: "get",
    path: "/{clientOrderId}",
    summary: "Get order status",
    description: "Retrieves the current status of an order by its client order ID.",
    tags: ["Orders"],
    request: {
      headers: OrderAuthHeadersSchema,
      params: GetOrderParamsSchema,
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: OrderStatusResponseSchema,
          },
        },
        description: "Order status retrieved.",
      },
      401: {
        description: "Authentication failed.",
      },
      404: {
        description: "Order not found.",
      },
    },
  }),
  async (c) => {
    const { clientOrderId } = c.req.valid("param")
    const data = await getOrderStatusService(clientOrderId)
    return c.json(data)
  },
)

// GET /v0/orders
ordersRouter.openapi(
  createRoute({
    method: "get",
    path: "/",
    summary: "List orders",
    description: "Lists orders with optional filters and pagination.",
    tags: ["Orders"],
    request: {
      headers: OrderAuthHeadersSchema,
      query: ListOrdersQuerySchema,
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: OrderListResponseSchema,
          },
        },
        description: "Order list retrieved.",
      },
      401: {
        description: "Authentication failed.",
      },
    },
  }),
  async (c) => {
    const { chainId, vaultAddress, status, createdAfter, createdBefore, limit, offset } =
      c.req.valid("query")

    const data = await listOrdersService({
      chainId,
      vaultAddress,
      status,
      createdAfter,
      createdBefore,
      limit,
      offset,
    })

    return c.json(data)
  },
)

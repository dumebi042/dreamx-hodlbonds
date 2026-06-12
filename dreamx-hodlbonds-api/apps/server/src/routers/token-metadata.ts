import type { ChainId } from "@hodlbonds-api/blockchain"

import { createRoute, OpenAPIHono } from "@hono/zod-openapi"
import { etag } from "hono/etag"

import { errors } from "@/lib/errors"
import { ReceiptTokenSchema, TokenRequestSchema } from "@/schemas"
// import { tokenService } from "@/services/token"
import { tokenMockService } from "@/services/token-mock"

export const tokenMetadataApp = new OpenAPIHono({
  defaultHook: (result) => {
    if (!result.success) {
      throw errors.badRequest("Invalid input", result.error)
    }
  },
})

tokenMetadataApp.use("/*", etag())

tokenMetadataApp.openapi(
  createRoute({
    method: "get",
    path: "/{chainId}/{factoryAddress}/{id}",
    description: "Get a specific token by its id on a given chain.",
    request: {
      params: TokenRequestSchema,
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: ReceiptTokenSchema,
          },
        },
        description: "The requested token.",
      },
      400: {
        description: "Invalid address or token contract error.",
      },
      404: {
        description: "Token not found at the specified address.",
      },
      429: {
        description: "Rate limit exceeded.",
      },
      503: {
        description: "Blockchain service temporarily unavailable.",
      },
    },
  }),
  async (c) => {
    const { chainId, factoryAddress, id } = c.req.valid("param")
    const data = await tokenMockService({
      chainId: Number(chainId) as ChainId,
      factoryAddress,
      id,
    })
    c.header("Cache-Control", "public, max-age=30, stale-while-revalidate=30")
    return c.json(data)
  },
)

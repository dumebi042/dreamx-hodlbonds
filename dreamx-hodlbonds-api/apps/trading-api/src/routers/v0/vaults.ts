import type { ChainId } from "@hodlbonds-api/blockchain"

import { createRoute, OpenAPIHono } from "@hono/zod-openapi"
import { etag } from "hono/etag"

import { errors } from "@/lib/errors"
import {
  ChainIdParamsSchema,
  VaultRequestSchema,
  VaultSchema,
  VaultsResponseSchema,
} from "@/schemas"
import { vaultDbService } from "@/services/vault-db"
import { vaultsDbService } from "@/services/vaults-db"

export const vaultsRouter = new OpenAPIHono({
  defaultHook: (result) => {
    if (!result.success) {
      throw errors.badRequest("Invalid input", result.error)
    }
  },
})

vaultsRouter.use("/*", etag())

// GET /v0/vaults/{chainId}
vaultsRouter.openapi(
  createRoute({
    method: "get",
    path: "/{chainId}",
    summary: "List vaults by chain",
    description: "Returns data for all vaults for a given chain.",
    tags: ["Vaults"],
    request: {
      params: ChainIdParamsSchema,
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: VaultsResponseSchema,
          },
        },
        description: "List of all active vaults on the specified chain.",
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
    const { chainId } = c.req.valid("param")
    const data = await vaultsDbService({ chainId: Number(chainId) as ChainId })
    c.header("Cache-Control", "public, max-age=30, stale-while-revalidate=30")
    return c.json(data)
  },
)

// GET /v0/vaults/{chainId}/{address}
vaultsRouter.openapi(
  createRoute({
    method: "get",
    path: "/{chainId}/{address}",
    summary: "Get vault by address",
    description: "Get a specific vault by its address on a given chain.",
    tags: ["Vaults"],
    request: {
      params: VaultRequestSchema,
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: VaultSchema,
          },
        },
        description: "The requested vault.",
      },
      400: {
        description: "Invalid address or vault contract error.",
      },
      404: {
        description: "Vault not found at the specified address.",
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
    const { chainId, address } = c.req.valid("param")
    const data = await vaultDbService({ chainId: Number(chainId) as ChainId, address })
    c.header("Cache-Control", "public, max-age=30, stale-while-revalidate=30")
    return c.json(data)
  },
)

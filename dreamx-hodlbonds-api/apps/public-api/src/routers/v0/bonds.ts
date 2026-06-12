import type { ChainId } from "@hodlbonds-api/blockchain"

import { createRoute, OpenAPIHono } from "@hono/zod-openapi"

import { errors } from "@/lib/errors"
import {
  BondByIdRequestSchema,
  BondDetailResponseSchema,
  BondsByOwnerRequestSchema,
  BondsByOwnerResponseSchema,
} from "@/schemas"
import { getBond, getBondsByOwner } from "@/services/bonds"

export const bondsRouter = new OpenAPIHono({
  defaultHook: (result) => {
    if (!result.success) {
      throw errors.badRequest("Invalid input", result.error)
    }
  },
})

// GET /v0/bonds/owner/:ownerAddress
// NOTE: Must be defined before /{chainId}/{vaultAddress} to avoid route conflict
bondsRouter.openapi(
  createRoute({
    method: "get",
    path: "/owner/{ownerAddress}",
    summary: "Get bonds by owner",
    description:
      "Retrieve all bonds owned by a specific address across all chains. Returns bonds where the owner has a non-zero receipt token balance.",
    tags: ["Bonds"],
    request: {
      params: BondsByOwnerRequestSchema,
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: BondsByOwnerResponseSchema,
          },
        },
        description: "List of bonds owned by the address",
      },
      400: {
        description: "Invalid owner address format",
      },
    },
  }),
  async (c) => {
    const { ownerAddress } = c.req.valid("param")

    const result = await getBondsByOwner({
      ownerAddress: ownerAddress,
    })

    return c.json(result)
  },
)

// GET /v0/bonds/:chainId/:vaultAddress
bondsRouter.openapi(
  createRoute({
    method: "get",
    path: "/{chainId}/{vaultAddress}",
    summary: "Get bond by ID",
    description:
      "Retrieve a single bond by its chain ID and vault address, including all related trades, balances, and transfers.",
    tags: ["Bonds"],
    request: {
      params: BondByIdRequestSchema,
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: BondDetailResponseSchema,
          },
        },
        description: "Bond details with related data",
      },
      400: {
        description: "Invalid chain ID or vault address format",
      },
      404: {
        description: "Bond not found",
      },
    },
  }),
  async (c) => {
    const { chainId, vaultAddress } = c.req.valid("param")

    const result = await getBond({
      chainId: Number(chainId) as ChainId,
      vaultAddress: vaultAddress,
    })

    return c.json(result)
  },
)

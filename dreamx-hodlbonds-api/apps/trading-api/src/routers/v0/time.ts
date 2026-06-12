import { createRoute, OpenAPIHono } from "@hono/zod-openapi"

import { ServerTimeSchema } from "@/schemas"

export const timeRouter = new OpenAPIHono()

// GET /v0/time/
timeRouter.openapi(
  createRoute({
    method: "get",
    path: "/",
    description: "Get the current server time in milliseconds.",
    tags: ["Utilities"],
    responses: {
      200: {
        content: {
          "application/json": {
            schema: ServerTimeSchema,
          },
        },
        description: "The current server time in milliseconds.",
      },
    },
  }),
  (c) => {
    c.header("Cache-Control", "no-store")
    return c.json({ serverTime: Date.now() })
  },
)

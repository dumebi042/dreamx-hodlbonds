import { swaggerUI } from "@hono/swagger-ui"
import { OpenAPIHono } from "@hono/zod-openapi"

import { ordersRouter } from "./orders"
import { timeRouter } from "./time"
import { vaultsRouter } from "./vaults"

export const v0Router = new OpenAPIHono()

// Mount sub-routers
v0Router.route("/time", timeRouter)
v0Router.route("/vaults", vaultsRouter)
v0Router.route("/orders", ordersRouter)

// OpenAPI documentation endpoint
v0Router.doc("/openapi.json", {
  openapi: "3.1.0",
  info: {
    title: "HodlBonds Trading API",
    version: "0.0.1",
    description: "Trading API for HodlBonds protocol - vault data and order execution.",
  },
  servers: [
    {
      url: "/v0",
      description: "API v0",
    },
  ],
})

// Swagger UI for interactive API documentation
v0Router.get("/docs", swaggerUI({ url: "/v0/openapi.json", deepLinking: true }))

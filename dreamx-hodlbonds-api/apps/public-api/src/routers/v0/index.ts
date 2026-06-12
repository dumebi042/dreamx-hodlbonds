import { OpenAPIHono } from "@hono/zod-openapi"

import { bondsRouter } from "./bonds"

export const v0Router = new OpenAPIHono()

// Mount sub-routers
v0Router.route("/bonds", bondsRouter)

// OpenAPI documentation endpoint
v0Router.doc("/openapi.json", {
  openapi: "3.1.0",
  info: {
    title: "HodlBonds Public API",
    version: "0.0.1",
    description: "Public API for accessing bond data from the HodlBonds protocol.",
  },
  servers: [
    {
      url: "/v0",
      description: "API v0",
    },
  ],
})

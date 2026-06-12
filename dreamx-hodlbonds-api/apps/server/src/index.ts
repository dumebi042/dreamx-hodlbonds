import { env } from "@hodlbonds-api/env/server"
import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { logger } from "hono/logger"

import { tokenMetadataApp } from "./routers/token-metadata"

const app = new Hono()

app.use(logger())
app.use(
  "/*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
  }),
)

app.get("/", (c) => {
  return c.text("OK")
})

app.get("/favicon.ico", (c) => {
  return c.body(null, 204)
})

app.route("/token", tokenMetadataApp)

serve(
  {
    fetch: app.fetch,
    port: env.PORT,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`)
  },
)

import { getDb, initDb } from "@hodlbonds-api/db"
import { env } from "@hodlbonds-api/env/trading-api"
import { serve } from "@hono/node-server"
import { sql } from "drizzle-orm"
import { Hono } from "hono"
import { rateLimiter } from "hono-rate-limiter"
import { bodyLimit } from "hono/body-limit"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import { secureHeaders } from "hono/secure-headers"
import { trimTrailingSlash } from "hono/trailing-slash"

import { errorHandler, errors } from "@/lib/errors"
import { rateLimitKey } from "@/lib/get-rate-limit-key"
import { initTokenCache, isTokenCacheReady } from "@/lib/token-cache"
import { queryStringLimit, sanitizeHeaders, sqlInjectionGuard } from "@/middleware"
import { orderStatusRouter } from "@/routers/internal/order-status"
import { v0Router } from "@/routers/v0"

const app = new Hono()

app.use(logger())

app.use("*", secureHeaders())
app.use("*", sanitizeHeaders)
app.use("*", queryStringLimit(1024))
app.use("*", sqlInjectionGuard)
app.use(
  "/v0/*",
  bodyLimit({
    maxSize: 1024, // 1KB
    onError: () => {
      throw errors.payloadTooLarge("Payload exceeds maximum size of 1KB")
    },
  }),
)
app.use(
  "/*",
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"], // Explicit allowed headers
    maxAge: 86400, // Cache preflight for 24 hours
    // credentials: false, // Set to true only if needed
  }),
)
app.use(
  rateLimiter({
    windowMs: 60 * 1000, // Sustain @ 60/min
    limit: 60,
    standardHeaders: "draft-6",
    keyGenerator: rateLimitKey,
    skip: (c: { req: { path: string } }) => c.req.path.startsWith("/internal/"),
  }),
)
app.use(
  rateLimiter({
    windowMs: 1000, // Burst @ 10/sec
    limit: 10,
    standardHeaders: "draft-6",
    keyGenerator: rateLimitKey,
    skip: (c: { req: { path: string } }) => c.req.path.startsWith("/internal/"),
  }),
)
app.use(trimTrailingSlash())

app.onError(errorHandler)

app.get("/", (c) => {
  return c.text("HodlBonds Trading API")
})

app.get("/favicon.ico", (c) => {
  return c.body(null, 204)
})

app.get("/health", async (c) => {
  try {
    const db = getDb()
    await db.execute(sql`SELECT 1`)
    const cacheReady = isTokenCacheReady()
    return c.json({
      timestamp: Date.now(),
      status: cacheReady ? "healthy" : "degraded",
      db: "connected",
      tokenCache: cacheReady ? "ready" : "not initialized",
    })
  } catch (error) {
    console.error("Health check failed:", error)
    return c.json(
      {
        timestamp: Date.now(),
        status: "unhealthy",
        db: "disconnected",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      503,
    )
  }
})

// Mount routers
app.route("/internal/order-status", orderStatusRouter)
app.route("/v0", v0Router)

async function startServer() {
  try {
    console.log("Initializing database connection...")
    await initDb()
    console.log("Database connection successful")

    console.log("Initializing token cache...")
    await initTokenCache()
    console.log("Token cache initialized")
  } catch (error) {
    console.error("Failed to initialize:", error)
    // In production, fail fast so Cloud Run knows the instance is unhealthy
    if (env.NODE_ENV === "production") {
      process.exit(1)
    }
    // In dev, warn but continue (might be running without DB)
    console.warn("Continuing without full initialization (development mode)")
  }

  return serve(
    {
      fetch: app.fetch,
      port: env.PORT,
    },
    (info) => {
      if (env.NODE_ENV === "development") {
        console.log(`🚀 Server is running on http://localhost:${info.port}`)
      } else {
        console.log(`🚀 Server is running on port ${info.port}`)
      }
    },
  )
}

const server = await startServer()

process.on("SIGTERM", () => {
  console.log("SIGTERM received, closing server gracefully...")
  server.close(() => {
    console.log("Server closed")
    process.exit(0)
  })
})

process.on("SIGINT", () => {
  console.log("SIGINT received, closing server gracefully...")
  server.close(() => {
    console.log("Server closed")
    process.exit(0)
  })
})

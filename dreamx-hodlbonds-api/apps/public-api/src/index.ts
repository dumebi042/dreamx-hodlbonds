import { getDb, initDb } from "@hodlbonds-api/db"
import { env } from "@hodlbonds-api/env/public-api"
import { serve } from "@hono/node-server"
import { sql } from "drizzle-orm"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import { trimTrailingSlash } from "hono/trailing-slash"

import { errorHandler } from "./lib/errors"
import { initTokenCache, isTokenCacheReady } from "./lib/token-cache"
import { v0Router } from "./routers/v0"

const app = new Hono()

app.use(logger())
app.use(
  "/*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
  }),
)
app.use(trimTrailingSlash())

// Global error handler
app.onError(errorHandler)

app.get("/", (c) => {
  return c.text("HodlBonds API")
})

app.get("/favicon.ico", (c) => {
  return c.body(null, 204)
})

// Health check endpoint - tests actual DB connectivity and cache status
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

// Mount v0 API router
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

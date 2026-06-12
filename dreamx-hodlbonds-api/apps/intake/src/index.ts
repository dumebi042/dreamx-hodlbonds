import { getDb, initDb } from "@hodlbonds-api/db"
import { env } from "@hodlbonds-api/env/intake"
import { serve } from "@hono/node-server"
import { sql } from "drizzle-orm"
import { Hono } from "hono"
import { logger } from "hono/logger"

import { ingestTransaction } from "./lib/ingest-transaction"
import { getEventStats, replayEvent, replayFailedEvents } from "./lib/replay"
import { hmacAuth } from "./middleware/auth"
import { processAlchemyWebhook } from "./services/alchemy-webhook"

const app = new Hono()

app.use(logger())

app.get("/", (c) => {
  return c.text("OK")
})

// Health check endpoint - tests actual DB connectivity
app.get("/health", async (c) => {
  try {
    const db = getDb()
    await db.execute(sql`SELECT 1`)
    return c.json({ timestamp: Date.now(), status: "healthy", db: "connected" })
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

// Supported chains
const SUPPORTED_CHAINS = [
  43113, // Avalanche Fuji
  11155111, // Sepolia
] as const

// Alchemy webhook endpoint with chainId in path
app.post("/webhooks/alchemy/:chainId", async (c) => {
  try {
    const chainId = Number(c.req.param("chainId"))
    if (!SUPPORTED_CHAINS.includes(chainId as any)) {
      console.error(`Unsupported chain: ${chainId}`)
      return c.json({ error: "Unsupported chain" }, 400)
    }

    const rawBody = await c.req.text()
    const signature = c.req.header("X-Alchemy-Signature")

    const result = await processAlchemyWebhook(
      rawBody,
      signature,
      env.ALCHEMY_SIGNING_KEYS,
      chainId,
    )

    return c.json(result)
  } catch (error) {
    console.error("Error processing webhook:", error)

    // Return appropriate error status
    if (error instanceof Error) {
      // Auth errors - don't retry
      if (error.message.includes("signature")) {
        return c.json({ error: error.message }, 401)
      }
      // Transform/parse errors - retry (500)
      if (error.name === "AlchemyTransformError" || error.name === "SyntaxError") {
        return c.json({ error: error.message }, 500)
      }
    }

    // Processing errors after logs stored - don't retry (we have the data)
    return c.json({ error: "Processing failed" }, 200)
  }
})

// ============ Admin/Debug Endpoints ============
app.use("/admin/*", hmacAuth(10_000, 500))

// Get event processing stats
app.get("/admin/events/stats", async (c) => {
  try {
    const stats = await getEventStats()
    return c.json(stats)
  } catch (error) {
    console.error("Failed to get event stats:", error)
    return c.json({ error: error instanceof Error ? error.message : "Unknown error" }, 500)
  }
})

// Replay all failed events
app.post("/admin/events/replay", async (c) => {
  try {
    const limitParam = c.req.query("limit")
    const limit = limitParam ? Number(limitParam) : undefined

    console.log(`Admin: Replaying failed events${limit ? ` (limit: ${limit})` : ""}`)
    await replayFailedEvents(limit)

    const stats = await getEventStats()
    return c.json({ message: "Replay complete", stats })
  } catch (error) {
    console.error("Failed to replay events:", error)
    return c.json({ error: error instanceof Error ? error.message : "Unknown error" }, 500)
  }
})

// Replay a specific event
app.post("/admin/events/replay/:chainId/:txHash/:logIndex", async (c) => {
  try {
    const chainId = Number(c.req.param("chainId"))
    const txHash = c.req.param("txHash")
    const logIndex = Number(c.req.param("logIndex"))

    console.log(`Admin: Replaying event chainId=${chainId} txHash=${txHash} logIndex=${logIndex}`)
    await replayEvent(chainId, txHash, logIndex)

    return c.json({ message: "Event replayed successfully" })
  } catch (error) {
    console.error("Failed to replay event:", error)
    return c.json({ error: error instanceof Error ? error.message : "Unknown error" }, 500)
  }
})

// Ingest a transaction from the blockchain
app.post("/admin/events/ingest/:chainId/:txHash", async (c) => {
  try {
    const chainId = Number(c.req.param("chainId"))
    const txHash = c.req.param("txHash") as `0x${string}`

    if (!SUPPORTED_CHAINS.includes(chainId as any)) {
      return c.json({ error: `Unsupported chain: ${chainId}` }, 400)
    }

    console.log(`Admin: Ingesting transaction ${txHash} on chain ${chainId}`)
    const result = await ingestTransaction(chainId, txHash)

    return c.json({
      message: "Transaction ingested successfully",
      ...result,
    })
  } catch (error) {
    console.error("Failed to ingest transaction:", error)
    return c.json({ error: error instanceof Error ? error.message : "Unknown error" }, 500)
  }
})

// Startup: initialize DB and start server
async function startServer() {
  try {
    console.log("Initializing database connection...")
    await initDb()
    console.log("Database connection successful")
  } catch (error) {
    console.error("Failed to connect to database:", error)
    // In production, fail fast so Cloud Run knows the instance is unhealthy
    if (env.NODE_ENV === "production") {
      process.exit(1)
    }
    // In dev, warn but continue (might be running without DB)
    console.warn("Continuing without database connection (development mode)")
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

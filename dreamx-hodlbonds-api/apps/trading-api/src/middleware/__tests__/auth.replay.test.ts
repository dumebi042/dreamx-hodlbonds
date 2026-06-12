/**
 * Regression test for F-2026-15390: Authentication Bypass via Replay Attack
 *
 * Verifies that the HMAC middleware rejects a second request that reuses
 * an identical timestamp + key ID combination (i.e. a replayed request).
 *
 * This test FAILS before the fix (seenTimestamps.set() is missing) and
 * PASSES after the fix is applied.
 */

import { createHash, createHmac } from "node:crypto"

import { Hono } from "hono"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// ---------------------------------------------------------------------------
// Mock @hodlbonds-api/env/trading-api before any app module is imported.
// auth.ts and errors.ts both read env at module scope, so we must intercept
// the module before it executes.
// ---------------------------------------------------------------------------

const TEST_KEY_ID = "test-key"
const TEST_SECRET = "test-secret-value"

vi.mock("@hodlbonds-api/env/trading-api", () => ({
  env: {
    API_KEYS: new Map([["test-key", "test-secret-value"]]),
    NODE_ENV: "test",
  },
}))

import { errorHandler } from "@/lib/errors"
import { hmacAuth } from "@/middleware/auth"

// ---------------------------------------------------------------------------
// Helpers — mirror the canonical string logic in the middleware
// ---------------------------------------------------------------------------

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex")
}

function buildCanonicalString(
  method: string,
  path: string,
  bodyHash: string,
  timestamp: string,
): string {
  return `${method}\n${path}\n${bodyHash}\n${timestamp}`
}

function signRequest(
  secret: string,
  method: string,
  path: string,
  body: string,
  timestamp: number,
): string {
  const bodyHash = sha256Hex(body)
  const canonical = buildCanonicalString(method.toUpperCase(), path, bodyHash, String(timestamp))
  return createHmac("sha256", secret).update(canonical).digest("base64")
}

function makeRequest(path: string, timestamp: number, signature: string): Request {
  return new Request(`http://localhost${path}`, {
    method: "GET",
    headers: {
      "x-api-key": TEST_KEY_ID,
      "x-timestamp": String(timestamp),
      "x-signature": signature,
    },
  })
}

// ---------------------------------------------------------------------------
// Test app
// ---------------------------------------------------------------------------

function buildApp() {
  const app = new Hono()
  app.onError(errorHandler)
  app.use("*", hmacAuth())
  app.get("/test", (c) => c.json({ ok: true }))
  return app
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("hmacAuth — replay attack prevention (F-2026-15390)", () => {
  let app: ReturnType<typeof buildApp>

  beforeEach(() => {
    // Fresh app (and fresh cache) for each test
    app = buildApp()
    vi.useFakeTimers()
    vi.setSystemTime(Date.now())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("accepts a valid first request", async () => {
    const timestamp = Date.now()
    const sig = signRequest(TEST_SECRET, "GET", "/test", "", timestamp)
    const res = await app.request(makeRequest("/test", timestamp, sig))
    expect(res.status).toBe(200)
  })

  it("rejects a replayed request with the same timestamp and signature", async () => {
    const timestamp = Date.now()
    const sig = signRequest(TEST_SECRET, "GET", "/test", "", timestamp)

    // First request — should succeed
    const first = await app.request(makeRequest("/test", timestamp, sig))
    expect(first.status).toBe(200)

    // Replay — same headers, same signature — must be rejected
    const replay = await app.request(makeRequest("/test", timestamp, sig))
    expect(replay.status).toBe(401)
  })

  it("accepts a second request with a different timestamp", async () => {
    const t1 = Date.now()
    const t2 = t1 + 1 // different millisecond → different replayKey

    const sig1 = signRequest(TEST_SECRET, "GET", "/test", "", t1)
    const sig2 = signRequest(TEST_SECRET, "GET", "/test", "", t2)

    const first = await app.request(makeRequest("/test", t1, sig1))
    expect(first.status).toBe(200)

    const second = await app.request(makeRequest("/test", t2, sig2))
    expect(second.status).toBe(200)
  })
})

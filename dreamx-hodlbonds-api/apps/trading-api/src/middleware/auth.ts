import type { MiddlewareHandler } from "hono"

import { env } from "@hodlbonds-api/env/trading-api"
import { LRUCache } from "lru-cache"
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto"

import { errors } from "@/lib/errors"

const apiKeys = env.API_KEYS
const DUMMY_SECRET = randomBytes(32).toString("hex")

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex")
}

function hmacSha256(secret: string, data: string): Buffer {
  return createHmac("sha256", secret).update(data).digest()
}

function buildCanonicalString(
  method: string,
  path: string,
  bodyHash: string,
  timestamp: string,
): string {
  return `${method}\n${path}\n${bodyHash}\n${timestamp}`
}

function isValidBase64(str: string): boolean {
  if (!str) return false
  if (str.length % 4 !== 0) return false
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(str)) return false
  try {
    const decoded = Buffer.from(str, "base64")
    return decoded.toString("base64") === str
  } catch {
    return false
  }
}

/**
 * HMAC authentication middleware
 *
 * Verifies HMAC-SHA256 signatures on API requests to prevent tampering and replay attacks.
 *
 * Required headers:
 * - X-Api-Key: The key ID
 * - X-Timestamp: Request timestamp in milliseconds
 * - X-Signature: Base64-encoded HMAC signature
 *
 * @param maxSkewMs - Maximum allowed time difference (default: 30 seconds)
 */
export function hmacAuth(maxSkewMs = 30_000, maxReplayCacheSize = 10_000): MiddlewareHandler {
  const seenTimestamps = new LRUCache<string, boolean>({
    max: maxReplayCacheSize,
    ttl: maxSkewMs * 2,
    updateAgeOnGet: false,
    updateAgeOnHas: false,
  })

  return async (c, next) => {
    const keyId = c.req.header("x-api-key") ?? ""
    const tsHeader = c.req.header("x-timestamp") ?? ""
    const sigHeader = c.req.header("x-signature") ?? ""

    if (!keyId || !tsHeader || !sigHeader || !isValidBase64(sigHeader)) {
      throw errors.unauthorized("Authentication failed")
    }

    const timestamp = Number(tsHeader)
    const now = Date.now()
    const timestampIsValid = Number.isFinite(timestamp)
    const timestampInRange = Math.abs(now - timestamp) <= maxSkewMs

    if (!timestampIsValid || !timestampInRange) {
      throw errors.unauthorized("Authentication failed")
    }

    const url = new URL(c.req.url)

    // Check for replay attack
    const replayKey = `${keyId}:${timestamp}`
    if (seenTimestamps.has(replayKey)) {
      console.warn("Potential replay attack detected")
      throw errors.unauthorized("Authentication failed")
    }

    // Prevent timing attacks on the key existence check
    const secret = apiKeys.get(keyId) ?? DUMMY_SECRET
    const keyIsValid = apiKeys.has(keyId)

    // Hash the request body
    const method = c.req.method.toUpperCase()
    const path = url.pathname
    const bodyText = await c.req.raw.clone().text()
    const bodyHash = sha256Hex(bodyText || "")
    const canonicalString = buildCanonicalString(method, path, bodyHash, tsHeader)

    // Signature comparison (constant-time)
    const expectedSig = hmacSha256(secret, canonicalString)
    const receivedSig = Buffer.from(sigHeader, "base64")

    const paddedReceived = Buffer.alloc(expectedSig.length)
    const copyLength = Math.min(receivedSig.length, expectedSig.length)
    if (copyLength > 0) {
      receivedSig.copy(paddedReceived, 0, 0, copyLength)
    }

    const signaturesMatch = timingSafeEqual(expectedSig, paddedReceived)

    if (!keyIsValid || !signaturesMatch) {
      throw errors.unauthorized("Authentication failed")
    }

    seenTimestamps.set(replayKey, true)

    // Store key ID for downstream use
    c.set("apiKeyId", keyId)

    await next()
  }
}

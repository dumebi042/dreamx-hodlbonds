import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"

const DUMMY_SECRET = randomBytes(32).toString("hex")

/**
 * Validates Alchemy webhook signature using HMAC SHA256
 * @param body - Raw request body as string
 * @param signature - X-Alchemy-Signature header value
 * @param signingKey - Your Alchemy signing key
 */
function validateAlchemySignature(body: string, signature: string, signingKey: string): boolean {
  const computed = createHmac("sha256", signingKey).update(body, "utf8").digest("hex")
  const a = Buffer.from(computed, "utf8")
  const b = Buffer.from(signature.length === computed.length ? signature : DUMMY_SECRET, "utf8")
  return timingSafeEqual(a, b) && signature.length === computed.length
}

/**
 * Validates Alchemy webhook signature against multiple possible signing keys.
 * Tries each key until one matches.
 * @param body - Raw request body as string
 * @param signature - X-Alchemy-Signature header value
 * @param signingKeys - Object mapping webhook names to signing keys
 * @returns The name of the matching webhook key, or null if none match
 */
export function validateAlchemySignatureMultiKey(
  body: string,
  signature: string,
  signingKeys: Record<string, string>,
): string | null {
  for (const [name, key] of Object.entries(signingKeys)) {
    if (validateAlchemySignature(body, signature, key)) {
      return name
    }
  }

  console.log(`[signature] No keys matched the provided signature`)
  return null
}

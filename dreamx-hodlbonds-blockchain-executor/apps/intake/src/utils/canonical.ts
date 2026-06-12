import type { Message } from "@dreamx-development/hodlbonds-blockchain-executor-dto"

import crypto from "node:crypto"

// Deterministic canonical serializer for hashing and comparison.
// Produces compact JSON-like strings with keys sorted to ensure stable output.
export function canonicalize(v: unknown): string {
  if (v === null) return "null"
  const t = typeof v
  if (t === "bigint") return JSON.stringify((v as bigint).toString())
  if (t === "string") return JSON.stringify(v)
  if (t === "number" || t === "boolean") return JSON.stringify(v)
  if (Array.isArray(v)) return `[` + v.map((el) => canonicalize(el)).join(",") + `]`
  if (t === "object") {
    const obj = v as Record<string, unknown>
    const keys = Object.keys(obj).toSorted()
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(",")}}`
  }
  return JSON.stringify(v)
}

export function computeHash(message: Message): string {
  const canonicalData = canonicalize(message.data)
  const sha256 = crypto.createHash("sha256")
  sha256.update(`${message.network}|${message.executor}|${message.earliestTry}|${canonicalData}`)
  return sha256.digest("hex")
}

import type { HonoRequest } from "hono"

import { isIP } from "node:net"

const HEADER_ORDER = [
  // 'cf-connecting-ip',
  // 'true-client-ip',
  // 'x-client-ip',
  // 'x-real-ip',
  "x-forwarded-for",
  "forwarded",
] as const

function normalizeIp(raw: string): string {
  let s = raw.trim().replaceAll(/^"+|"+$/g, "")
  // Strip [IPv6]:port
  if (s.startsWith("[")) {
    const end = s.indexOf("]")
    if (end > 0) s = s.slice(1, end)
  } else {
    // Strip :port for IPv4/host:port
    const parts = s.split(":")
    if (parts.length === 2) s = parts[0] ?? s
  }
  // Remove IPv4-mapped IPv6 prefix
  s = s.replace(/^::ffff:/i, "")
  return s
}

function parseForwardedHeader(value: string): string | null {
  // Prefer the right-most (last appended) entry
  const parts = value
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .toReversed()
  for (const part of parts) {
    const token = part
      .split(";")
      .map((t) => t.trim())
      .find((t) => t.startsWith("for="))
    if (!token) continue
    const [, raw] = token.split("=")
    if (!raw) continue
    const ip = normalizeIp(raw)
    if (isIP(ip)) return ip
  }
  return null
}

export function getClientIp(req: HonoRequest, extraHeaderOrder: string[] = []): string {
  const names = [...extraHeaderOrder, ...HEADER_ORDER]
  for (const name of names) {
    const val = req.header(name as any)
    if (!val) continue

    let candidate: string | null = null
    if (name === "x-forwarded-for") {
      const parts = val
        .split(",")
        .map((p) => normalizeIp(p))
        .filter(Boolean)
      candidate = parts.at(-1) ?? null // GFE appends client IP at the end
    } else if (name === "forwarded") {
      candidate = parseForwardedHeader(val)
    } else {
      candidate = normalizeIp(val)
    }

    if (candidate && isIP(candidate)) return candidate
  }
  return ""
}

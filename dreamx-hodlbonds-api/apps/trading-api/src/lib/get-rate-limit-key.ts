import type { Context } from "hono"

import { getConnInfo } from "@hono/node-server/conninfo"
import { createHash } from "node:crypto"

import { getClientIp } from "./get-client-ip"

function hashId(s: string) {
  return createHash("sha256").update(s).digest("hex").slice(0, 16)
}

export function rateLimitKey(c: Context) {
  // const apiKey = c.req.header('x-api-key')
  // if (apiKey) return `key:${hashId(apiKey)}`

  // const auth = c.req.header('authorization')
  // const m = auth?.match(/^Bearer\s+(.+)$/i)
  // if (m?.[1]) return `bearer:${hashId(m[1])}`

  const headerIp = getClientIp(c.req) // trusted on Cloud Run (GFE)
  const remote = getConnInfo(c).remote.address // proxy IP on Cloud Run
  return headerIp || remote || `anon:${hashId(c.req.header("user-agent") ?? "")}`
}

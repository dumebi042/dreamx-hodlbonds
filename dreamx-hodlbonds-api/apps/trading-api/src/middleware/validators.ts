import type { Context, Next } from "hono"

import { errors } from "@/lib/errors"
import { getClientIp } from "@/lib/get-client-ip"

/**
 * Blocks requests containing headers commonly used in host header injection attacks
 */
export const sanitizeHeaders = async (c: Context, next: Next) => {
  const dangerousHeaders = ["x-forwarded-host", "x-original-url", "x-rewrite-url"]

  for (const header of dangerousHeaders) {
    if (c.req.header(header)) {
      const ip = getClientIp(c.req) || "unknown"
      console.warn(`Blocked request with dangerous header: ${header} from IP: ${ip}`)
      throw errors.badRequest("Invalid request headers")
    }
  }

  await next()
}

/**
 * Validates query string length
 */
export const queryStringLimit = (maxLength: number = 2048) => {
  return async (c: Context, next: Next) => {
    const url = new URL(c.req.url)

    if (url.search.length > maxLength) {
      throw errors.uriTooLong(`Query string exceeds maximum length of ${maxLength} characters`)
    }

    await next()
  }
}

/**
 * Basic SQL injection pattern detection (defense in depth)
 */
export const sqlInjectionGuard = async (c: Context, next: Next) => {
  const suspiciousPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/gi,
    /(--|\/\*|\*\/|;|\bunion\b)/gi,
  ]

  const checkValue = (value: any): boolean => {
    if (typeof value === "string") {
      return suspiciousPatterns.some((pattern) => pattern.test(value))
    }
    if (typeof value === "object" && value !== null) {
      return Object.values(value).some((v) => checkValue(v))
    }
    return false
  }

  const query = c.req.query()

  if (checkValue(query)) {
    const ip = getClientIp(c.req) || "unknown"
    console.warn("Suspicious SQL pattern detected", {
      path: c.req.path,
      query,
      ip,
      timestamp: new Date().toISOString(),
    })
    throw errors.badRequest("Invalid request parameters")
  }

  await next()
}

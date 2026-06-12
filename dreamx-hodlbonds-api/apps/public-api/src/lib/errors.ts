import type { Context } from "hono"

import { env as config } from "@hodlbonds-api/env/public-api"
import { HTTPException } from "hono/http-exception"
import * as z from "zod"
// import { getClientIp } from "./get-client-ip"

export const errors = {
  badRequest: (message: string, details?: z.ZodError<unknown>) =>
    new HTTPException(400, { message, cause: details ? z.flattenError(details) : undefined }),
  unauthorized: (message = "Unauthorized access") => new HTTPException(401, { message }),
  forbidden: (message = "Access forbidden") => new HTTPException(403, { message }),
  notFound: (resource: string, id?: string | number) =>
    new HTTPException(404, {
      message: id ? `${resource} with id ${id} not found` : `${resource} not found`,
    }),
  conflict: (message: string) => new HTTPException(409, { message }),
  payloadTooLarge: (message: string = "Request payload too large") =>
    new HTTPException(413, { message }),
  uriTooLong: (message: string = "Request URI too long") => new HTTPException(414, { message }),
  unsupportedMediaType: (message: string = "Unsupported media type") =>
    new HTTPException(415, { message }),
  unprocessableEntity: (message: string) => new HTTPException(422, { message }),
  tooManyRequests: (message: string = "Too many requests") => new HTTPException(429, { message }),
  internal: (message = "Internal server error") => new HTTPException(500, { message }),
  serviceUnavailable: (message = "Service temporarily unavailable") =>
    new HTTPException(503, { message }),
  gatewayTimeout: (message = "Upstream service timed out") => new HTTPException(504, { message }),
}

export const errorHandler = (err: Error, c: Context) => {
  const timestamp = new Date().toISOString()
  const method = c.req.method
  const path = c.req.path
  // const ip = getClientIp(c.req) || "unknown"
  const ip = "unknown"

  if (err instanceof HTTPException) {
    // Log client errors (4xx) at warn level
    if (err.status >= 400 && err.status < 500) {
      console.warn(`[${timestamp}] ${err.status} ${method} ${path} - ${err.message} - IP: ${ip}`)
    } else {
      // Log server errors (5xx) at error level
      console.error(`[${timestamp}] ${err.status} ${method} ${path} - ${err.message} - IP: ${ip}`, {
        cause: err.cause,
        stack: config.NODE_ENV === "development" ? err.stack : undefined,
      })
    }
    return c.json(
      {
        // success: false,
        // timestamp: new Date().toISOString(),
        error: {
          message: err.message,
          status: err.status,
          ...(config.NODE_ENV === "development" && typeof err.cause === "object" && err.cause
            ? { details: err.cause }
            : {}),
        },
      },
      err.status,
    )
  }

  console.error("Unhandled error:", err)
  return c.json(
    {
      // success: false,
      // timestamp: new Date().toISOString(),
      error: {
        message: config.NODE_ENV === "production" ? "Internal server error" : err.message,
        status: 500,
        ...(config.NODE_ENV === "development" && { stack: err.stack }),
      },
    },
    500,
  )
}

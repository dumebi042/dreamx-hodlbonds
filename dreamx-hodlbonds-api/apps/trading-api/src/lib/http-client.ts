import type { ContentfulStatusCode } from "hono/utils/http-status"

import { HTTPException } from "hono/http-exception"

import { errors } from "@/lib/errors"

const DEFAULT_TIMEOUT_MS = 10_000

type MediaType = `${string}/${string}`

type ServiceAwareInit = RequestInit & {
  timeoutMs?: number
  serviceName?: string
  expectedContentType?: MediaType
}

const getUpstreamName = (serviceName?: string) => serviceName ?? "Upstream service"

const assertContentType = (response: Response, expected?: MediaType, serviceName?: string) => {
  if (!expected) return

  const contentType = response.headers.get("content-type")?.toLowerCase()

  if (!contentType) {
    throw errors.internal(`${getUpstreamName(serviceName)} returned no content type header`)
  }

  if (!contentType.includes(expected.toLowerCase())) {
    throw errors.internal(`${getUpstreamName(serviceName)} returned unexpected content type`)
  }
}

const normalizeError = (status: number, serviceName?: string) => {
  const upstreamName = getUpstreamName(serviceName)

  switch (status) {
    case 503:
      return errors.serviceUnavailable(`${upstreamName} is unavailable`)
    case 504:
      return errors.gatewayTimeout(`${upstreamName} timed out`)
    default:
      return new HTTPException(status as ContentfulStatusCode, {
        message: `${upstreamName} returned ${status}`,
      })
  }
}

const abortWithTimeout = (controller: AbortController, timeoutMs: number) =>
  setTimeout(() => controller.abort(new DOMException("Request timed out", "AbortError")), timeoutMs)

const wireAbortSignals = (controller: AbortController, signal?: AbortSignal | null) => {
  if (!signal) return

  if (signal.aborted) {
    controller.abort(signal.reason)
    return
  }

  signal.addEventListener(
    "abort",
    () => {
      controller.abort(signal.reason)
    },
    { once: true },
  )
}

async function fetchWithHandling(url: string, init: ServiceAwareInit = {}) {
  const { timeoutMs, serviceName, expectedContentType, signal, ...fetchInit } = init
  const controller = new AbortController()
  wireAbortSignals(controller, signal)
  const timeout = abortWithTimeout(controller, timeoutMs ?? DEFAULT_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      ...fetchInit,
      signal: controller.signal,
    })

    if (!response.ok) {
      throw normalizeError(response.status, serviceName)
    }

    assertContentType(response, expectedContentType, serviceName)

    return response
  } catch (error) {
    if (error instanceof HTTPException) throw error

    if ((error as DOMException).name === "AbortError") {
      throw errors.gatewayTimeout(`${getUpstreamName(serviceName)} timed out`)
    }

    console.error("fetchWithHandling error:", error)
    throw errors.serviceUnavailable(`${getUpstreamName(serviceName)} request failed`)
  } finally {
    clearTimeout(timeout)
  }
}

export async function fetchJson<T>(url: string, init: ServiceAwareInit = {}): Promise<T> {
  const response = await fetchWithHandling(url, {
    ...init,
    expectedContentType: init.expectedContentType ?? "application/json",
  })

  try {
    return (await response.json()) as T
  } catch (error) {
    console.error("fetchJson parse error:", error)
    throw errors.internal(`${getUpstreamName(init.serviceName)} returned invalid JSON`)
  }
}

export async function fetchText(url: string, init: ServiceAwareInit = {}): Promise<string> {
  const response = await fetchWithHandling(url, init)
  return response.text()
}

export async function fetchBuffer(url: string, init: ServiceAwareInit = {}): Promise<Buffer> {
  const response = await fetchWithHandling(url, init)
  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

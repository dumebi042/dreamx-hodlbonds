import { createHash, createHmac } from "node:crypto"

interface OrderRequestParams {
  chainId?: string
  vaultAddress?: string
  status?: string
  limit?: number
  offset?: number
}

interface AuthConfig {
  keyId: string
  secret: string
  apiUrl: string
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex")
}

function hmacSha256Base64(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data).digest("base64")
}

function buildCanonicalString(
  method: string,
  path: string,
  bodyHash: string,
  timestamp: string,
): string {
  return `${method}\n${path}\n${bodyHash}\n${timestamp}`
}

async function getOrders(config: AuthConfig, params: OrderRequestParams = {}): Promise<any> {
  const method = "GET"
  const path = `/v0/orders`
  const timestamp = Date.now().toString()

  // Signature is computed over the path only (no query string)
  const bodyHash = sha256Hex("")
  const canonicalString = buildCanonicalString(method, path, bodyHash, timestamp)
  const signature = hmacSha256Base64(config.secret, canonicalString)

  // Append query params to the URL (not included in signature)
  const url = new URL(path, config.apiUrl)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value))
    }
  }

  const response = await fetch(url.toString(), {
    method,
    headers: {
      "content-type": "application/json",
      "x-api-key": config.keyId,
      "x-timestamp": timestamp,
      "x-signature": signature,
    },
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`API error (${response.status}): ${error}`)
  }

  return await response.json()
}

// Usage example
async function main() {
  const authConfig: AuthConfig = {
    keyId: "019a0723-6194-760e-8972-8e15e1df3c41",
    secret: "super-secret-key-change-me-in-production",
    apiUrl: "http://localhost:3001",
  }

  try {
    const result = await getOrders(authConfig, {
      chainId: "43113",
      // vaultAddress: "0xE58286163E912E9A82515a847FdFF018bb60388B", // LFJ
    })
    console.log("Data:", result)
  } catch (error) {
    console.error("Failed to retrieve data:", error)
  }
}

await main()

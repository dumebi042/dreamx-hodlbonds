import { createHash, createHmac, randomUUID } from "node:crypto"

interface OrderRequestPayload {
  clientOrderId: string
  vaultAddress: string
  side: "buy" | "sell"
  size: string
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

async function placeOrder(
  config: AuthConfig,
  chainId: number,
  orderRequest: OrderRequestPayload,
): Promise<any> {
  const method = "POST"
  const path = `/v0/orders/${chainId}`
  const url = new URL(path, config.apiUrl)
  const body = JSON.stringify(orderRequest)
  const timestamp = Date.now().toString()

  // Build canonical string
  const bodyHash = sha256Hex(body)
  const canonicalString = buildCanonicalString(method, path, bodyHash, timestamp)

  // Generate signature
  const signature = hmacSha256Base64(config.secret, canonicalString)

  // Make request
  const response = await fetch(url.toString(), {
    method,
    headers: {
      "content-type": "application/json",
      "x-api-key": config.keyId,
      "x-timestamp": timestamp,
      "x-signature": signature,
    },
    body,
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
    const result = await placeOrder(authConfig, 43113, {
      clientOrderId: randomUUID().replaceAll("-", ""),
      vaultAddress: "0xE58286163E912E9A82515a847FdFF018bb60388B", // LFJ
      side: "buy",
      size: "0.00000000123",
    })
    console.log("Order placed successfully:", result)
  } catch (error) {
    console.error("Failed to place order:", error)
  }
}

await main()

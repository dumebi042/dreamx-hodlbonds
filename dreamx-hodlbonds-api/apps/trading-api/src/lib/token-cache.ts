import type { Address } from "viem"

import { getDb } from "@hodlbonds-api/db"
import { tokens } from "@hodlbonds-api/db/schema"

export interface TokenInfo {
  address: string
  chainId: number
  symbol: string
  name: string
  decimals: number
}

// In-memory token cache, keyed by `${chainId}:${address}`
let tokenCache: Map<string, TokenInfo> | null = null

function makeKey(chainId: number, address: string): string {
  return `${chainId}:${address.toLowerCase()}`
}

/**
 * Load all tokens from the database into memory.
 * Call this once at application startup.
 */
export async function initTokenCache(): Promise<void> {
  if (tokenCache) {
    console.log("Token cache already initialized")
    return
  }

  const db = getDb()
  const allTokens = await db.select().from(tokens)

  tokenCache = new Map()
  for (const token of allTokens) {
    const key = makeKey(token.chainId, token.address)
    tokenCache.set(key, {
      address: token.address,
      chainId: token.chainId,
      symbol: token.symbol,
      name: token.name,
      decimals: token.decimals,
    })
  }

  console.log(`Token cache initialized with ${tokenCache.size} tokens`)
}

/**
 * Get token metadata from cache.
 * Returns undefined if token not found.
 */
export function getToken(chainId: number, address: Address): TokenInfo | undefined {
  if (!tokenCache) {
    throw new Error("Token cache not initialized. Call initTokenCache() first.")
  }
  return tokenCache.get(makeKey(chainId, address))
}

/**
 * Get token metadata, throwing if not found.
 */
export function getTokenOrThrow(chainId: number, address: Address): TokenInfo {
  const token = getToken(chainId, address)
  if (!token) {
    throw new Error(`Token not found: chainId=${chainId}, address=${address}`)
  }
  return token
}

/**
 * Refresh the token cache from the database.
 * Useful if tokens are added at runtime.
 */
export async function refreshTokenCache(): Promise<void> {
  tokenCache = null
  await initTokenCache()
}

/**
 * Check if cache is initialized (useful for health checks).
 */
export function isTokenCacheReady(): boolean {
  return tokenCache !== null
}

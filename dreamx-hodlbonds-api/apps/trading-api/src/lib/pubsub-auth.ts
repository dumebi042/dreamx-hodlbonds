import { OAuth2Client } from "google-auth-library"

const authClient = new OAuth2Client()

/**
 * Verifies the OIDC token from a PubSub push subscription.
 *
 * The push subscription must be configured with an OIDC token whose audience
 * matches the trading-api's SERVICE_URL (e.g., "https://trading-api-xxxxx.run.app").
 *
 * @param authHeader - The Authorization header value (e.g., "Bearer <token>")
 * @param expectedAudience - The expected audience claim (SERVICE_URL)
 * @param expectedEmail - Verifies the token was issued for this service account
 * @returns true if the token is valid, false otherwise
 */
export async function verifyPubSubOidcToken(
  authHeader: string | undefined,
  expectedAudience: string,
  expectedEmail: string,
): Promise<boolean> {
  if (!authHeader?.startsWith("Bearer ")) {
    return false
  }

  const token = authHeader.slice(7)

  try {
    const ticket = await authClient.verifyIdToken({
      idToken: token,
      audience: expectedAudience,
    })

    const payload = ticket.getPayload()
    if (!payload) return false

    if (payload.email !== expectedEmail) {
      console.warn(`OIDC token email mismatch: expected ${expectedEmail}, got ${payload.email}`)
      return false
    }

    return true
  } catch (error) {
    console.error("OIDC token verification failed:", error)
    return false
  }
}

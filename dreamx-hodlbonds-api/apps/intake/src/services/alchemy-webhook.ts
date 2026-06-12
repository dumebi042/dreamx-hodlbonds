import type { AlchemyWebhookPayload } from "@/types/alchemy"

import { transformAlchemyPayload } from "../adapters/alchemy"
import { routeEvents } from "../lib/event-router"
import { validateAlchemySignatureMultiKey } from "../lib/signature-validation"

/**
 * Processes an Alchemy webhook
 * Validates signature against multiple keys, transforms, and routes logs to event router
 * The router handles decoding and processing internally
 */
export async function processAlchemyWebhook(
  rawBody: string,
  signature: string | undefined,
  signingKeys: Record<string, string>,
  chainId: number,
): Promise<{ success: boolean; logsProcessed: number; webhookSource?: string }> {
  // Validate signature
  if (!signature) {
    throw new Error("Missing signature")
  }

  const matchedKey = validateAlchemySignatureMultiKey(rawBody, signature, signingKeys)
  if (!matchedKey) {
    throw new Error("Invalid signature")
  }

  // Parse payload (Zod validates structure in transformAlchemyPayload)
  const payload = JSON.parse(rawBody) as AlchemyWebhookPayload
  console.log(`Processing webhook event: ${payload.id} from '${matchedKey}' for chain ${chainId}`)

  // Transform and validate Alchemy payload to standardized viem Logs
  const logs = transformAlchemyPayload(payload, chainId)
  console.log(`Extracted ${logs.length} logs from webhook`)

  // Route logs through decode → handle pipeline
  // The router stores raw logs immediately, then decodes and processes
  await routeEvents(logs)

  return { success: true, logsProcessed: logs.length, webhookSource: matchedKey }
}

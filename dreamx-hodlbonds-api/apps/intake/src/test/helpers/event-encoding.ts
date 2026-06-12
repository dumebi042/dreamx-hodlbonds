/**
 * Generic utilities for encoding Ethereum events
 *
 * These utilities work with any ABI and are not specific to Alchemy payloads.
 * Use them to encode events for testing or to manually construct event logs.
 */

import type { Abi } from "viem"

import { encodeAbiParameters, encodeEventTopics } from "viem"

/**
 * Encode an Ethereum event into topics and data
 *
 * Uses viem's encodeEventTopics for indexed parameters (topics)
 * and encodeAbiParameters for non-indexed parameters (data).
 *
 * @param params - Event encoding parameters
 * @param params.abi - Contract ABI containing the event
 * @param params.eventName - Name of the event to encode
 * @param params.args - Event arguments as object with parameter names as keys
 * @returns Encoded topics and data for the event log
 *
 * @example
 * const { topics, data } = encodeEvent({
 *   abi: ERC20_ABI,
 *   eventName: 'Transfer',
 *   args: {
 *     from: '0x...',
 *     to: '0x...',
 *     value: 1000n,
 *   }
 * })
 */
export function encodeEvent(params: { abi: Abi; eventName: string; args: Record<string, any> }): {
  topics: [`0x${string}`, ...`0x${string}`[]]
  data: `0x${string}`
} {
  const { abi, eventName, args } = params

  // Find the event in ABI
  const eventAbi = abi.find((item) => item.type === "event" && item.name === eventName)

  if (!eventAbi || eventAbi.type !== "event") {
    throw new Error(`Event ${eventName} not found in ABI`)
  }

  // Encode topics (indexed parameters)
  // Topics array: [eventSignature, ...indexedParams]
  const topics = encodeEventTopics({
    abi: [eventAbi],
    eventName,
    args,
  }) as [`0x${string}`, ...`0x${string}`[]]

  // Encode data (non-indexed parameters)
  const nonIndexedInputs = eventAbi.inputs.filter((input) => !input.indexed)
  // Extract values in the same order as the non-indexed inputs
  const nonIndexedArgs = nonIndexedInputs.map((input) => {
    if (!input.name) {
      throw new Error(`Event parameter missing name in ABI: ${eventName}`)
    }
    return args[input.name]
  })
  const data =
    nonIndexedInputs.length > 0
      ? encodeAbiParameters(nonIndexedInputs, nonIndexedArgs)
      : ("0x" as `0x${string}`)

  return { topics, data }
}

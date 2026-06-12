/**
 * Tests for event-encoding utilities
 * Verifies event encoding functionality
 */

import { decodeEventLog, parseAbi } from "viem"
import { describe, expect, it } from "vitest"

import { encodeEvent } from "../event-encoding"

// Simple test ABI
const testAbi = parseAbi([
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 amount)",
  "event VaultCreated(address indexed vault, address indexed issuer, uint256 vaultId, uint256 bondPrice)",
  "event AllIndexed(address indexed sender, address indexed receiver)",
])

describe("encodeEvent", () => {
  it("encodes Transfer event correctly", () => {
    const from = "0x1111111111111111111111111111111111111111" as const
    const to = "0x2222222222222222222222222222222222222222" as const
    const value = 1000n

    const { topics, data } = encodeEvent({
      abi: testAbi,
      eventName: "Transfer",
      args: { from, to, value },
    })

    // Verify by decoding
    const decoded = decodeEventLog({
      abi: testAbi,
      topics,
      data,
    })

    expect(decoded.eventName).toBe("Transfer")
    expect(decoded.args).toEqual({
      from,
      to,
      value,
    })
  })

  it("encodes event with only indexed parameters", () => {
    const owner = "0x1111111111111111111111111111111111111111" as const
    const spender = "0x2222222222222222222222222222222222222222" as const
    const amount = 500n

    const { topics, data } = encodeEvent({
      abi: testAbi,
      eventName: "Approval",
      args: { owner, spender, amount },
    })

    // Should have 3 topics: event signature + 2 indexed params
    expect(topics).toHaveLength(3)
    // Non-indexed param should be in data
    expect(data).not.toBe("0x")

    const decoded = decodeEventLog({
      abi: testAbi,
      topics,
      data,
    })

    expect(decoded.eventName).toBe("Approval")
    expect(decoded.args).toEqual({
      owner,
      spender,
      amount,
    })
  })

  it("encodes event with multiple non-indexed parameters", () => {
    const vault = "0x1111111111111111111111111111111111111111" as const
    const issuer = "0x2222222222222222222222222222222222222222" as const
    const vaultId = 42n
    const bondPrice = 1000000000000000000n // 1 ETH

    const { topics, data } = encodeEvent({
      abi: testAbi,
      eventName: "VaultCreated",
      args: { vault, issuer, vaultId, bondPrice },
    })

    expect(topics).toHaveLength(3) // event sig + 2 indexed
    expect(data).not.toBe("0x")

    const decoded = decodeEventLog({
      abi: testAbi,
      topics,
      data,
    })

    expect(decoded.eventName).toBe("VaultCreated")
    expect(decoded.args).toEqual({
      vault,
      issuer,
      vaultId,
      bondPrice,
    })
  })

  it("throws error for non-existent event", () => {
    expect(() =>
      encodeEvent({
        abi: testAbi,
        eventName: "NonExistent",
        args: {},
      }),
    ).toThrow("Event NonExistent not found in ABI")
  })

  it("encodes event with only indexed parameters (no data)", () => {
    const sender = "0x1111111111111111111111111111111111111111" as const
    const receiver = "0x2222222222222222222222222222222222222222" as const

    const { topics, data } = encodeEvent({
      abi: testAbi,
      eventName: "AllIndexed",
      args: { sender, receiver },
    })

    // Should have 3 topics: event signature + 2 indexed params
    expect(topics).toHaveLength(3)
    // No non-indexed params, so data should be 0x
    expect(data).toBe("0x")

    const decoded = decodeEventLog({
      abi: testAbi,
      topics,
      data,
    })

    expect(decoded.eventName).toBe("AllIndexed")
    expect(decoded.args).toEqual({
      sender,
      receiver,
    })
  })

  it("throws error when event parameter is missing a name in ABI", () => {
    // Create an ABI with an unnamed parameter (edge case)
    const malformedAbi = [
      {
        type: "event",
        name: "BadEvent",
        inputs: [
          { type: "address", indexed: false, name: "" }, // Empty name
        ],
      },
    ] as const

    expect(() =>
      encodeEvent({
        abi: malformedAbi,
        eventName: "BadEvent",
        args: {},
      }),
    ).toThrow("Event parameter missing name in ABI: BadEvent")
  })
})

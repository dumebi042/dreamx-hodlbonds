import type { Signer } from "ethers"

import { describe, expect, it } from "vitest"

import { Wallet } from "../src/Wallet"

describe("Wallet tests", () => {
  it("Constructor: Sets Signer", () => {
    expect.assertions(3)

    const mockId = 223355
    const mockSigner = "Signer 123" as unknown as Signer
    const mockAddress = "0x447799"

    const wallet = new Wallet(mockSigner, mockId, mockAddress)

    expect(wallet.getId()).toBe(mockId)
    expect(wallet.getSigner()).toBe(mockSigner)
    expect(wallet.getAddress()).toBe(mockAddress)
  })
})

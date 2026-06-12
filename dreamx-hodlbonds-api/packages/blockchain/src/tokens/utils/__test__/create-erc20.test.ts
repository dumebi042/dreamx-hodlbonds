import { parseAbi } from "viem"
import { describe, expect, it } from "vitest"

import { createERC20 } from "../create-erc20"

describe("createERC20", () => {
  it("should create a token with default erc20Abi when no abi is provided", () => {
    const token = createERC20({
      name: "Test Token",
      symbol: "TEST",
      decimals: 18,
      addresses: {
        43113: "0x1234567890123456789012345678901234567890",
      },
    })

    expect(token.name).toBe("Test Token")
    expect(token.symbol).toBe("TEST")
    expect(token.decimals).toBe(18)
    expect(token.type).toBe("ERC20")

    const contract = token.contract(43113)
    expect(contract).toBeDefined()
    expect(contract.read.balanceOf).toBeDefined()
  })

  it("should create a token with custom abi when abi is provided", () => {
    const mintableErc20Abi = parseAbi([
      "function balanceOf(address) view returns (uint256)",
      "function transfer(address to, uint256 amount) returns (bool)",
      "function mint(address to, uint256 amount)",
      "function burn(uint256 amount)",
    ])

    const token = createERC20(
      {
        name: "Mintable Token",
        symbol: "MINT",
        decimals: 18,
        addresses: {
          43113: "0x1234567890123456789012345678901234567890",
        },
      },
      mintableErc20Abi,
    )

    expect(token.name).toBe("Mintable Token")
    expect(token.symbol).toBe("MINT")

    const contract = token.contract(43113)
    expect(contract).toBeDefined()
    expect(contract.read.balanceOf).toBeDefined()
    expect(contract.write.mint).toBeDefined()
  })

  it("should format and parse values correctly", () => {
    const token = createERC20({
      name: "Test Token",
      symbol: "TEST",
      decimals: 6, // USDC-like decimals
      addresses: {
        43113: "0x1234567890123456789012345678901234567890",
      },
    })

    const parsed = token.parse("1000.5")
    expect(parsed).toBe(1000500000n)

    const formatted = token.format(1000500000n)
    expect(formatted).toBe("1000.5")
  })

  it("should throw error when accessing address for unsupported chain", () => {
    const token = createERC20({
      name: "Test Token",
      symbol: "TEST",
      decimals: 18,
      addresses: {
        43113: "0x1234567890123456789012345678901234567890",
      },
    })

    expect(() => token.address(11155111)).toThrow("Test Token not deployed on chainId 11155111")
  })
})

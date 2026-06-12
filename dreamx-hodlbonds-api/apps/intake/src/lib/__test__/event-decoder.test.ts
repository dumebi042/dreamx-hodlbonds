/**
 * Tests for event decoder
 * Verifies decoding of blockchain events using real ABIs
 */

import { dualTokenVaultAbi, dualTokenVaultFactoryAbi } from "@hodlbonds-api/blockchain"
import { describe, expect, it } from "vitest"

import { buildLog, buildLogFromEvent } from "@/test/helpers/log-builders"

import { decodeLog, decodeLogs } from "../event-decoder"

describe("decodeLog", () => {
  it("decodes VaultCreated event correctly", () => {
    const creator = "0x1111111111111111111111111111111111111111" as const
    const vaultId = 42n
    const pairId = 1n
    const vaultAddress = "0x2222222222222222222222222222222222222222" as const
    const approvedPair = {
      stableTokenAddress: "0x3333333333333333333333333333333333333333" as const,
      vaultTokenAddress: "0x4444444444444444444444444444444444444444" as const,
      wrappedNativeTokenAddress: "0x5555555555555555555555555555555555555555" as const,
      routerAddress: "0x6666666666666666666666666666666666666666" as const,
      tokenPairAddress: "0x7777777777777777777777777777777777777777" as const,
      version: 2,
      routerV2Address: "0x8888888888888888888888888888888888888888" as const,
      pairAddress: "0x9999999999999999999999999999999999999999" as const,
      concentrated: false,
      chainlinkPriceOracleAddress: "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as const,
    }
    const vaultParameters = {
      vaultId: 42n,
      vaultTokenAddress: "0x4444444444444444444444444444444444444444" as const,
      stableTokenAddress: "0x3333333333333333333333333333333333333333" as const,
      receiptTokenAddress: "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as const,
      chainlinkPriceOracleAddress: "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as const,
      minUSDPricePerBond: 1000000n,
      feeSplitterAddress: "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC" as const,
      managementFee: 200,
      performanceFee: 1000,
      bondPrice: 1000000000000000000n, // 1 ETH
      reserveRatio: 5000, // 50%
      tradingPeriodDuration: 86400, // 1 day
      primaryDex: 1,
    }

    const log = buildLogFromEvent({
      abi: dualTokenVaultFactoryAbi,
      eventName: "VaultCreated",
      args: { creator, vaultId, pairId, vaultAddress, approvedPair, vaultParameters },
      contractAddress: "0xfactoryaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const,
      overrides: { chainId: 1, logIndex: 5 },
    })

    const event = decodeLog(log, "VaultCreated")

    expect(event).not.toBeNull()
    expect(event!.eventName).toBe("VaultCreated")
    expect(event!.args.creator).toBe(creator)
    expect(event!.args.vaultId).toBe(vaultId)
    expect(event!.args.pairId).toBe(pairId)
    expect(event!.args.vaultAddress).toBe(vaultAddress)
    expect(event!.args.approvedPair).toEqual(approvedPair)
    expect(event!.args.vaultParameters).toEqual(vaultParameters)

    // Verify original log fields are preserved
    expect(event!.chainId).toBe(1)
    expect(event!.logIndex).toBe(5)
    expect(event!.address).toBe("0xfactoryaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
  })

  it("decodes BondIssued event correctly", () => {
    const creator = "0x1111111111111111111111111111111111111111" as const
    const vaultToken = "0x2222222222222222222222222222222222222222" as const
    const stableToken = "0x3333333333333333333333333333333333333333" as const
    const vaultTokenAmount = 1000000n
    const stableTokenAmount = 5000000n
    const managementFeeAmount = 50000n

    const log = buildLogFromEvent({
      abi: dualTokenVaultAbi,
      eventName: "BondIssued",
      args: {
        creator,
        vaultToken,
        stableToken,
        vaultTokenAmount,
        stableTokenAmount,
        managementFeeAmount,
      },
      contractAddress: "0xvaultaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const,
      overrides: { chainId: 137 },
    })

    const event = decodeLog(log, "BondIssued")

    expect(event).not.toBeNull()
    expect(event!.eventName).toBe("BondIssued")
    expect(event!.args.creator).toBe(creator)
    expect(event!.args.vaultToken).toBe(vaultToken)
    expect(event!.args.stableToken).toBe(stableToken)
    expect(event!.args.vaultTokenAmount).toBe(vaultTokenAmount)
    expect(event!.args.stableTokenAmount).toBe(stableTokenAmount)
    expect(event!.args.managementFeeAmount).toBe(managementFeeAmount)
    expect(event!.chainId).toBe(137)
  })

  it("decodes TradeCompleted event correctly", () => {
    const vaultAddress = "0x1111111111111111111111111111111111111111" as const
    const routerAddress = "0x2222222222222222222222222222222222222222" as const
    const tokenIn = "0x3333333333333333333333333333333333333333" as const
    const tokenOut = "0x4444444444444444444444444444444444444444" as const
    const amountIn = 1000000n
    const amountOut = 900000n
    const tokenInBalanceAfterSwap = 5000000n
    const tokenOutBalanceAfterSwap = 4100000n

    const log = buildLogFromEvent({
      abi: dualTokenVaultAbi,
      eventName: "TradeCompleted",
      args: {
        vaultAddress,
        routerAddress,
        tokenIn,
        tokenOut,
        amountIn,
        amountOut,
        tokenInBalanceAfterSwap,
        tokenOutBalanceAfterSwap,
      },
      contractAddress: "0xvaultaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const,
    })

    const event = decodeLog(log, "TradeCompleted")

    expect(event).not.toBeNull()
    expect(event!.eventName).toBe("TradeCompleted")
    expect(event!.args.vaultAddress).toBe(vaultAddress)
    expect(event!.args.routerAddress).toBe(routerAddress)
    expect(event!.args.tokenIn).toBe(tokenIn)
    expect(event!.args.tokenOut).toBe(tokenOut)
    expect(event!.args.amountIn).toBe(amountIn)
    expect(event!.args.amountOut).toBe(amountOut)
    expect(event!.args.tokenInBalanceAfterSwap).toBe(tokenInBalanceAfterSwap)
    expect(event!.args.tokenOutBalanceAfterSwap).toBe(tokenOutBalanceAfterSwap)
  })

  it("returns events from known contracts even without handlers", () => {
    // ApprovedPairSet is in the ABI but not in our handler list
    // decodeLog should still return it - the router will filter it out
    const log = buildLogFromEvent({
      abi: dualTokenVaultFactoryAbi,
      eventName: "ApprovedPairSet",
      args: {
        sender: "0x1111111111111111111111111111111111111111",
        pairId: 1n,
        approvedPair: {
          stableTokenAddress: "0x2222222222222222222222222222222222222222",
          vaultTokenAddress: "0x3333333333333333333333333333333333333333",
          wrappedNativeTokenAddress: "0x4444444444444444444444444444444444444444",
          routerAddress: "0x5555555555555555555555555555555555555555",
          tokenPairAddress: "0x6666666666666666666666666666666666666666",
          version: 2,
          routerV2Address: "0x7777777777777777777777777777777777777777",
          pairAddress: "0x8888888888888888888888888888888888888888",
          concentrated: false,
          chainlinkPriceOracleAddress: "0x9999999999999999999999999999999999999999",
        },
      },
    })

    const event = decodeLog(log)

    expect(event).not.toBeNull()
    expect(event?.eventName).toBe("ApprovedPairSet")
  })

  it("returns null for completely unrecognized events", () => {
    // Random log that doesn't match any ABI
    const log = buildLog({
      topics: ["0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as const] as [
        `0x${string}`,
        ...`0x${string}`[],
      ],
      data: "0xdeadbeef" as const,
    })

    const event = decodeLog(log)

    expect(event).toBeNull()
  })

  it("returns null for invalid log data", () => {
    // Valid event signature but invalid data
    const log = buildLogFromEvent({
      abi: dualTokenVaultAbi,
      eventName: "BondIssued",
      args: {
        creator: "0x1111111111111111111111111111111111111111",
        vaultToken: "0x2222222222222222222222222222222222222222",
        stableToken: "0x3333333333333333333333333333333333333333",
        vaultTokenAmount: 1000000n,
        stableTokenAmount: 5000000n,
        managementFeeAmount: 50000n,
      },
    })

    // Corrupt the data
    const corruptedLog = { ...log, data: "0xbadd" as `0x${string}` }

    const event = decodeLog(corruptedLog)

    expect(event).toBeNull()
  })
})

describe("decodeLogs", () => {
  it("decodes multiple logs and filters out unrecognized ones", () => {
    const vaultCreatedLog = buildLogFromEvent({
      abi: dualTokenVaultFactoryAbi,
      eventName: "VaultCreated",
      args: {
        creator: "0x1111111111111111111111111111111111111111",
        vaultId: 1n,
        pairId: 1n,
        vaultAddress: "0x2222222222222222222222222222222222222222",
        approvedPair: {
          stableTokenAddress: "0x3333333333333333333333333333333333333333",
          vaultTokenAddress: "0x4444444444444444444444444444444444444444",
          wrappedNativeTokenAddress: "0x5555555555555555555555555555555555555555",
          routerAddress: "0x6666666666666666666666666666666666666666",
          tokenPairAddress: "0x7777777777777777777777777777777777777777",
          version: 2,
          routerV2Address: "0x8888888888888888888888888888888888888888",
          pairAddress: "0x9999999999999999999999999999999999999999",
          concentrated: false,
          chainlinkPriceOracleAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
        vaultParameters: {
          vaultId: 1n,
          vaultTokenAddress: "0x4444444444444444444444444444444444444444",
          stableTokenAddress: "0x3333333333333333333333333333333333333333",
          receiptTokenAddress: "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB",
          chainlinkPriceOracleAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          minUSDPricePerBond: 1000000n,
          feeSplitterAddress: "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC",
          managementFee: 200,
          performanceFee: 1000,
          bondPrice: 1000000000000000000n,
          reserveRatio: 5000,
          tradingPeriodDuration: 86400,
          primaryDex: 1,
        },
      },
    })

    const bondIssuedLog = buildLogFromEvent({
      abi: dualTokenVaultAbi,
      eventName: "BondIssued",
      args: {
        creator: "0x1111111111111111111111111111111111111111",
        vaultToken: "0x2222222222222222222222222222222222222222",
        stableToken: "0x3333333333333333333333333333333333333333",
        vaultTokenAmount: 1000000n,
        stableTokenAmount: 5000000n,
        managementFeeAmount: 50000n,
      },
    })

    const unrecognizedLog = buildLog()

    const approvedPairSetLog = buildLogFromEvent({
      abi: dualTokenVaultFactoryAbi,
      eventName: "ApprovedPairSet",
      args: {
        sender: "0x1111111111111111111111111111111111111111",
        pairId: 1n,
        approvedPair: {
          stableTokenAddress: "0x2222222222222222222222222222222222222222",
          vaultTokenAddress: "0x3333333333333333333333333333333333333333",
          wrappedNativeTokenAddress: "0x4444444444444444444444444444444444444444",
          routerAddress: "0x5555555555555555555555555555555555555555",
          tokenPairAddress: "0x6666666666666666666666666666666666666666",
          version: 2,
          routerV2Address: "0x7777777777777777777777777777777777777777",
          pairAddress: "0x8888888888888888888888888888888888888888",
          concentrated: false,
          chainlinkPriceOracleAddress: "0x9999999999999999999999999999999999999999",
        },
      },
    })

    const events = decodeLogs([vaultCreatedLog, bondIssuedLog, unrecognizedLog, approvedPairSetLog])

    // Should have 3 events (VaultCreated, BondIssued, and ApprovedPairSet)
    // unrecognizedLog doesn't match any ABI so it's filtered out
    expect(events).toHaveLength(3)
    expect(events[0]!.eventName).toBe("VaultCreated")
    expect(events[1]!.eventName).toBe("BondIssued")
    expect(events[2]!.eventName).toBe("ApprovedPairSet")
  })

  it("returns empty array when no logs are recognized", () => {
    const log1 = buildLog()
    const log2 = buildLog()
    const log3 = buildLog()

    const events = decodeLogs([log1, log2, log3])

    expect(events).toEqual([])
  })

  it("handles empty array", () => {
    const events = decodeLogs([])

    expect(events).toEqual([])
  })

  it("decodes BondIssued and TradeCompleted events correctly", () => {
    const bondIssuedLog = buildLogFromEvent({
      abi: dualTokenVaultAbi,
      eventName: "BondIssued",
      args: {
        creator: "0x1111111111111111111111111111111111111111",
        vaultToken: "0x2222222222222222222222222222222222222222",
        stableToken: "0x3333333333333333333333333333333333333333",
        vaultTokenAmount: 1000000n,
        stableTokenAmount: 5000000n,
        managementFeeAmount: 50000n,
      },
      overrides: { logIndex: 0 },
    })

    const tradeCompletedLog = buildLogFromEvent({
      abi: dualTokenVaultAbi,
      eventName: "TradeCompleted",
      args: {
        vaultAddress: "0x1111111111111111111111111111111111111111",
        routerAddress: "0x2222222222222222222222222222222222222222",
        tokenIn: "0x3333333333333333333333333333333333333333",
        tokenOut: "0x4444444444444444444444444444444444444444",
        amountIn: 1000000n,
        amountOut: 900000n,
        tokenInBalanceAfterSwap: 5000000n,
        tokenOutBalanceAfterSwap: 4100000n,
      },
      overrides: { logIndex: 1 },
    })

    const unrecognizedLog = buildLog({ logIndex: 2 })

    const events = decodeLogs([bondIssuedLog, tradeCompletedLog, unrecognizedLog])

    // Should have 2 events (BondIssued and TradeCompleted), filtering out unrecognized
    expect(events).toHaveLength(2)
    expect(events[0]!.eventName).toBe("BondIssued")
    expect(events[0]!.logIndex).toBe(0)
    expect(events[1]!.eventName).toBe("TradeCompleted")
    expect(events[1]!.logIndex).toBe(1)
  })
})

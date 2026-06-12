import { HodlBondsTradeClient } from "@dreamx-development/hodlbonds-blockchain-executor-client"
import { HodlBondsTradeOp, Network } from "@dreamx-development/hodlbonds-blockchain-executor-dto"
import { clients } from "@hodlbonds-api/blockchain"
import { lbPairAbi } from "@hodlbonds-api/blockchain"
import { contractMap } from "@hodlbonds-api/blockchain"
import { env } from "@hodlbonds-api/env/trading-api"
import { zeroAddress } from "viem"

import type { LFJPoolConfig } from "@/types"

import { withBlockchainError } from "@/lib/blockchain-error-handler"
import { errors } from "@/lib/errors"

import type {
  DexAdapter,
  DexQuoteResult,
  DexSimulateParams,
  DexSwapParams,
  PoolToken,
  TradeConfig,
} from "./types"

import {
  calculateMinAmountOut,
  generateExecutorMerkleProof,
  getExecutorClientNetwork,
} from "./utils"

export class LFJAdapter implements DexAdapter<LFJPoolConfig> {
  readonly name = "LFJ"
  readonly poolConfig: LFJPoolConfig
  readonly tradeConfig: TradeConfig
  readonly inputToken: PoolToken
  readonly outputToken: PoolToken
  private swapForY: boolean | null = null
  private wrappedNativeTokenAddress?: `0x${string}`
  private readonly executorNetwork: Network

  constructor(
    poolConfig: LFJPoolConfig,
    tradeConfig: TradeConfig,
    vaultToken: PoolToken,
    stableToken: PoolToken,
    wrappedNativeTokenAddress?: `0x${string}`,
  ) {
    this.poolConfig = poolConfig
    this.tradeConfig = tradeConfig
    this.wrappedNativeTokenAddress = wrappedNativeTokenAddress
    const executorNetwork = getExecutorClientNetwork(tradeConfig.chainId)
    if (!executorNetwork) {
      throw errors.internal(
        `No executor client network mapping for chain ID ${tradeConfig.chainId}`,
      )
    }
    this.executorNetwork = executorNetwork
    const { inputToken, outputToken } = this.initializeSwapDirection(vaultToken, stableToken)
    this.inputToken = inputToken
    this.outputToken = outputToken
  }

  protected initializeSwapDirection(vaultToken: PoolToken, stableToken: PoolToken) {
    // Determine swap direction & which pool currency position the vault token occupies
    // Buy: swap stable → vault
    // Sell: swap vault → stable

    // Determine input/output tokens based on side
    const inputToken = this.tradeConfig.side === "buy" ? stableToken : vaultToken
    const outputToken = this.tradeConfig.side === "buy" ? vaultToken : stableToken

    return { inputToken, outputToken }
  }

  /**
   * Resolves the swapForY direction by querying the LBPair contract.
   */
  private async resolveSwapDirection(): Promise<boolean> {
    if (this.swapForY !== null) {
      return this.swapForY
    }

    const client = clients[this.tradeConfig.chainId]
    const pairAddress = this.poolConfig.tokenPairAddress

    // Fetch tokenX and tokenY from the pair contract via multicall
    const [tokenX, tokenY] = await withBlockchainError(
      () =>
        client.multicall({
          contracts: [
            { address: pairAddress, abi: lbPairAbi, functionName: "getTokenX" },
            { address: pairAddress, abi: lbPairAbi, functionName: "getTokenY" },
          ],
          allowFailure: false,
        }),
      {
        chainId: this.tradeConfig.chainId,
        pairAddress,
        operation: "getTokenX/getTokenY",
      },
    )

    const rawInputTokenAddress = this.inputToken.address(this.tradeConfig.chainId)
    // Use wrapped native token address if input token is native (zeroAddress)
    const inputTokenAddress =
      rawInputTokenAddress.toLowerCase() === zeroAddress && this.wrappedNativeTokenAddress
        ? this.wrappedNativeTokenAddress.toLowerCase()
        : rawInputTokenAddress.toLowerCase()

    // swapForY = true means we're swapping tokenX → tokenY
    // swapForY = false means we're swapping tokenY → tokenX
    if (inputTokenAddress === tokenX.toLowerCase()) {
      this.swapForY = true
    } else if (inputTokenAddress === tokenY.toLowerCase()) {
      this.swapForY = false
    } else {
      throw errors.internal(
        `Input token ${inputTokenAddress} does not match pair tokens (X: ${tokenX}, Y: ${tokenY})`,
      )
    }

    return this.swapForY
  }

  async getQuote(): Promise<DexQuoteResult> {
    const swapForY = await this.resolveSwapDirection()
    const amountIn = this.inputToken.parse(this.tradeConfig.size)
    const pairAddress = this.poolConfig.tokenPairAddress

    const pairContract = contractMap.lbPair.contract(this.tradeConfig.chainId, pairAddress)

    // Call getSwapOut on the LBPair contract
    // Returns: [amountInLeft, amountOut, fee]
    // - amountInLeft > 0 means insufficient liquidity for full swap
    // - amountOut is the expected output amount
    // - fee is the fee charged for the swap
    // Note: amountIn is uint128 in the contract, so we clamp to max uint128
    const clampedAmountIn = amountIn > BigInt(2 ** 128 - 1) ? BigInt(2 ** 128 - 1) : amountIn
    const [amountInLeft, expectedOutput, fee] = await withBlockchainError(
      () => pairContract.read.getSwapOut([clampedAmountIn, swapForY]),
      {
        chainId: this.tradeConfig.chainId,
        pairAddress,
        operation: "getSwapOut",
        amountIn: amountIn.toString(),
        swapForY,
      },
    )

    // If amountInLeft > 0, the pool doesn't have enough liquidity
    if (amountInLeft > 0n) {
      throw errors.badRequest(
        `Insufficient liquidity in pool. Only ${this.inputToken.format(amountIn - amountInLeft)} of ${this.tradeConfig.size} can be swapped.`,
      )
    }

    const minAmountOut = calculateMinAmountOut(expectedOutput)

    console.log("LBPair quote:", {
      amountIn: this.inputToken.format(amountIn),
      expectedOutput: this.outputToken.format(expectedOutput),
      fee: fee.toString(),
      minAmountOut: this.outputToken.format(minAmountOut),
      swapForY,
    })

    return {
      expectedOutput,
      minAmountOut,
    }
  }

  /**
   * Simulate the swap on the vault contract to verify it won't revert.
   * Uses the vault's lbSwapExactInputSingle function.
   */
  async simulateSwap(params: DexSimulateParams): Promise<void> {
    const client = clients[this.tradeConfig.chainId]
    const vaultAddress = this.tradeConfig.vaultAddress
    const amountIn = this.inputToken.parse(this.tradeConfig.size)
    const tokenIn = this.inputToken.address(this.tradeConfig.chainId)

    // The simulation needs to be called from an account with trader role
    const simulationAccount = env.EXECUTOR_ADDRESSES[0]
    if (!simulationAccount) {
      throw errors.internal("No executor simulation account configured")
    }
    const proof = generateExecutorMerkleProof(simulationAccount)

    await withBlockchainError(
      () =>
        client.simulateContract({
          address: vaultAddress,
          abi: contractMap.dualTokenVault.abi,
          functionName: "lbSwapExactInputSingle",
          args: [
            BigInt(amountIn) > BigInt(2 ** 128 - 1) ? BigInt(2 ** 128 - 1) : amountIn, // uint128 amountIn
            params.minAmountOut > BigInt(2 ** 128 - 1) ? BigInt(2 ** 128 - 1) : params.minAmountOut, // uint128 minAmountOut
            tokenIn,
            params.deadline,
            proof,
          ],
          account: simulationAccount,
        }),
      {
        chainId: this.tradeConfig.chainId,
        vaultAddress,
        operation: "simulateSwap (lbSwapExactInputSingle)",
        amountIn: amountIn.toString(),
        minAmountOut: params.minAmountOut.toString(),
      },
    )

    console.log("LFJ swap simulation passed")
  }

  async executeSwap(params: DexSwapParams): Promise<string> {
    console.log("Executing LFJ swap...")

    const executorClient = new HodlBondsTradeClient(env.EXECUTOR_PUBSUB_TOPIC)
    const messageId = await executorClient.publishHodlBondsTradeUpdate(this.executorNetwork, {
      op: HodlBondsTradeOp.LFJ_EXACT_IN,
      clientOrderId: this.tradeConfig.clientOrderId,
      poolAddress: this.tradeConfig.vaultAddress,
      inputToken: this.inputToken.address(this.tradeConfig.chainId),
      quantity: this.inputToken.parse(this.tradeConfig.size).toString(),
      minAmountOut: params.minAmountOut.toString(),
      deadline: Number(params.deadline),
    })

    console.log("Published HodlBonds trade message with ID:", messageId)

    return messageId
  }
}

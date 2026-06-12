import { HodlBondsTradeClient } from "@dreamx-development/hodlbonds-blockchain-executor-client"
import { HodlBondsTradeOp, Network } from "@dreamx-development/hodlbonds-blockchain-executor-dto"
import { clients } from "@hodlbonds-api/blockchain"
import { contractMap } from "@hodlbonds-api/blockchain"
import { env } from "@hodlbonds-api/env/trading-api"
import { zeroAddress } from "viem"

import type { BlackholePoolConfig } from "@/types"

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

export class BlackholeAdapter implements DexAdapter<BlackholePoolConfig> {
  readonly name = "Blackhole"
  readonly poolConfig: BlackholePoolConfig
  readonly tradeConfig: TradeConfig
  readonly inputToken: PoolToken
  readonly outputToken: PoolToken
  private readonly executorNetwork: Network

  constructor(
    poolConfig: BlackholePoolConfig,
    tradeConfig: TradeConfig,
    vaultToken: PoolToken,
    stableToken: PoolToken,
  ) {
    this.poolConfig = poolConfig
    this.tradeConfig = tradeConfig
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

  getQuote(): Promise<DexQuoteResult> {
    if (this.poolConfig.concentrated) {
      return this.getConcentratedQuote()
    }
    return this.getBasicQuote()
  }

  /**
   * Get quote for basic (V2-style) pools using Pair.getAmountOut()
   */
  private async getBasicQuote(): Promise<DexQuoteResult> {
    const amountIn = this.inputToken.parse(this.tradeConfig.size)
    const pairAddress = this.poolConfig.pairAddress
    const tokenIn = this.inputToken.address(this.tradeConfig.chainId)

    const pairContract = contractMap.blackholePair.contract(this.tradeConfig.chainId, pairAddress)

    const expectedOutput = await withBlockchainError(
      () => pairContract.read.getAmountOut([amountIn, tokenIn]),
      {
        chainId: this.tradeConfig.chainId,
        pairAddress,
        operation: "getAmountOut",
        amountIn: amountIn.toString(),
        tokenIn,
      },
    )

    if (expectedOutput === 0n) {
      throw errors.badRequest("Insufficient liquidity for swap")
    }

    const minAmountOut = calculateMinAmountOut(expectedOutput)

    return {
      expectedOutput,
      minAmountOut,
    }
  }

  /**
   * Get quote for concentrated (Algebra) pools using QuoterV2.quoteExactInputSingle()
   *
   * The `deployer` param is set to address(0) for standard pools.
   * If custom deployer support is needed in the future, we could:
   *
   * 1. Query the Algebra Factory for the pool's custom deployer:
   *    ```typescript
   *    // Add to algebraFactoryAbi:
   *    // 'function customPoolByPair(address customDeployer, address tokenA, address tokenB) external view returns (address customPool)'
   *    // 'function poolByPair(address tokenA, address tokenB) external view returns (address pool)'
   *    //
   *    // If poolByPair returns the pool address, deployer is address(0)
   *    // If we need to find the deployer for a custom pool, we'd need additional logic
   *    ```
   *
   * 2. Or query the pool itself for its plugin/deployer info:
   *    ```typescript
   *    // const poolContract = contractMap.algebraPool.contract(chainId, poolAddress)
   *    // const globalState = await poolContract.read.globalState()
   *    // The pluginConfig in globalState might help identify the deployer
   *    ```
   */
  private async getConcentratedQuote(): Promise<DexQuoteResult> {
    const amountIn = this.inputToken.parse(this.tradeConfig.size)
    const tokenIn = this.inputToken.address(this.tradeConfig.chainId)
    const tokenOut = this.outputToken.address(this.tradeConfig.chainId)
    const client = clients[this.tradeConfig.chainId]

    const quoterContract = contractMap.algebraQuoterV2.contract(this.tradeConfig.chainId)

    // QuoterV2.quoteExactInputSingle is not a view function, so we need to simulate it
    // The deployer is address(0) for standard pools
    // limitSqrtPrice of 0 means no price limit (use max/min sqrt ratio internally)
    const { result } = await withBlockchainError(
      () =>
        client.simulateContract({
          address: quoterContract.address,
          abi: contractMap.algebraQuoterV2.abi,
          functionName: "quoteExactInputSingle",
          args: [
            {
              tokenIn,
              tokenOut,
              deployer: zeroAddress, // Standard pools use address(0)
              amountIn,
              limitSqrtPrice: 0n, // No price limit
            },
          ],
        }),
      {
        chainId: this.tradeConfig.chainId,
        operation: "quoteExactInputSingle",
        amountIn: amountIn.toString(),
        tokenIn,
        tokenOut,
      },
    )

    // Result is a tuple: [amountOut, amountIn, sqrtPriceX96After, initializedTicksCrossed, gasEstimate, fee]
    const [
      expectedOutput,
      _amountIn,
      _sqrtPriceX96After,
      _initializedTicksCrossed,
      _gasEstimate,
      fee,
    ] = result

    if (expectedOutput === 0n) {
      throw errors.badRequest("Insufficient liquidity for swap")
    }

    const minAmountOut = calculateMinAmountOut(expectedOutput)

    console.log("BlackholePair quote:", {
      amountIn: this.inputToken.format(amountIn),
      expectedOutput: this.outputToken.format(expectedOutput),
      fee: fee.toString(),
      minAmountOut: this.outputToken.format(minAmountOut),
    })

    return {
      expectedOutput,
      minAmountOut,
    }
  }

  /**
   * Simulate the swap on the vault contract to verify it won't revert.
   * Uses the vault's blackholeSwapExactInputSingle function.
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
          functionName: "blackholeSwapExactInputSingle",
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
        operation: "simulateSwap (blackholeSwapExactInputSingle)",
        amountIn: amountIn.toString(),
        minAmountOut: params.minAmountOut.toString(),
      },
    )

    console.log("Blackhole swap simulation passed")
  }

  async executeSwap(params: DexSwapParams): Promise<string> {
    console.log("Executing Blackhole swap...")

    const executorClient = new HodlBondsTradeClient(env.EXECUTOR_PUBSUB_TOPIC)
    const messageId = await executorClient.publishHodlBondsTradeUpdate(this.executorNetwork, {
      op: HodlBondsTradeOp.BLACKHOLE_EXACT_IN,
      clientOrderId: this.tradeConfig.clientOrderId,
      poolAddress: this.tradeConfig.vaultAddress,
      inputToken: this.inputToken.address(this.tradeConfig.chainId),
      // inputToken: '0xb3B3CbEd8243682845C2ff23Ea1FD48e6144E34F', // Blackhole wAVAX
      quantity: this.inputToken.parse(this.tradeConfig.size).toString(),
      minAmountOut: params.minAmountOut.toString(),
      deadline: Number(params.deadline),
    })

    console.log("Published HodlBonds trade message with ID:", messageId)

    return messageId
  }
}

import { HodlBondsTradeClient } from "@dreamx-development/hodlbonds-blockchain-executor-client"
import { HodlBondsTradeOp, Network } from "@dreamx-development/hodlbonds-blockchain-executor-dto"
import { contractMap } from "@hodlbonds-api/blockchain"
import { env } from "@hodlbonds-api/env/trading-api"

import type { UniswapPoolConfig } from "@/types"

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

import { calculateMinAmountOut, getExecutorClientNetwork } from "./utils"

export class UniswapV4Adapter implements DexAdapter<UniswapPoolConfig> {
  readonly name = "Uniswap V4"
  readonly poolConfig: UniswapPoolConfig
  readonly tradeConfig: TradeConfig
  readonly inputToken: PoolToken
  readonly outputToken: PoolToken
  protected zeroForOne: boolean
  protected currency0: PoolToken
  protected currency1: PoolToken
  private readonly executorNetwork: Network

  constructor(
    poolConfig: UniswapPoolConfig,
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
    const { inputToken, outputToken, zeroForOne, currency0, currency1 } =
      this.initializeSwapDirection(vaultToken, stableToken)
    this.inputToken = inputToken
    this.outputToken = outputToken
    this.zeroForOne = zeroForOne
    this.currency0 = currency0
    this.currency1 = currency1
  }

  protected initializeSwapDirection(vaultToken: PoolToken, stableToken: PoolToken) {
    // Determine swap direction & which pool currency position the vault token occupies
    // Buy: swap stable → vault
    // Sell: swap vault → stable
    const vaultIsCurrency0 =
      vaultToken.address(this.tradeConfig.chainId).toLowerCase() ===
      this.poolConfig.poolKey.currency0.toLowerCase()
    const zeroForOne = this.tradeConfig.side === "buy" ? !vaultIsCurrency0 : vaultIsCurrency0

    // Map token details to currency positions for the swap
    const currency0 = vaultIsCurrency0 ? vaultToken : stableToken
    const currency1 = vaultIsCurrency0 ? stableToken : vaultToken

    // Determine input/output tokens based on side
    const inputToken = this.tradeConfig.side === "buy" ? stableToken : vaultToken
    const outputToken = this.tradeConfig.side === "buy" ? vaultToken : stableToken

    return { inputToken, outputToken, zeroForOne, currency0, currency1 }
  }

  /**
   * Determine swap direction for Uniswap V4 based on currency0/currency1 ordering
   */
  // determineSwapDirection(vaultToken: Token, stableToken: Token, side: 'buy' | 'sell'): SwapDirection {
  //   // In Uniswap, determine which currency position the vault token occupies
  //   const vaultIsCurrency0 =
  //     vaultToken.address(this.tradeConfig.chainId).toLowerCase() === this.poolConfig.poolKey.currency0.toLowerCase()

  //   // Buy: swap stable → vault (zeroForOne depends on which is currency0)
  //   // Sell: swap vault → stable
  //   const zeroForOne = side === 'buy' ? !vaultIsCurrency0 : vaultIsCurrency0

  //   // Map tokens to currency positions
  //   const currency0 = vaultIsCurrency0 ? vaultToken : stableToken
  //   const currency1 = vaultIsCurrency0 ? stableToken : vaultToken

  //   // Determine input/output based on side
  //   const inputToken = side === 'buy' ? stableToken : vaultToken
  //   const outputToken = side === 'buy' ? vaultToken : stableToken

  //   return {
  //     inputToken,
  //     outputToken,
  //     zeroForOne,
  //     currency0,
  //     currency1,
  //   }
  // }

  async getQuote(): Promise<DexQuoteResult> {
    const quoterContract = contractMap.uniswapV4Quoter.contract(this.tradeConfig.chainId)
    const quoteArgs = {
      poolKey: this.poolConfig.poolKey,
      exactAmount: this.inputToken.parse(this.tradeConfig.size),
      zeroForOne: this.zeroForOne,
      hookData: this.poolConfig.poolKey.hooks,
    }

    const { result: quoteResult } = await withBlockchainError(
      async () => await quoterContract.simulate.quoteExactInputSingle([quoteArgs]),
      { chainId: this.tradeConfig.chainId, args: quoteArgs },
    )

    const expectedOutput = quoteResult[0]
    const minAmountOut = calculateMinAmountOut(expectedOutput)

    return {
      expectedOutput,
      minAmountOut,
    }
  }

  /**
   * Simulate the swap on the vault contract to verify it won't revert.
   * TODO: Implement when Uniswap V4 vault swap function is available.
   */
  simulateSwap(_params: DexSimulateParams): Promise<void> {
    // Uniswap V4 simulation not yet implemented
    console.log("Uniswap V4 swap simulation skipped (not implemented)")
    return Promise.resolve()
  }

  async executeSwap(params: DexSwapParams): Promise<string> {
    console.log("Executing Uniswap V4 swap...")

    const executorClient = new HodlBondsTradeClient(env.EXECUTOR_PUBSUB_TOPIC)
    const messageId = await executorClient.publishHodlBondsTradeUpdate(this.executorNetwork, {
      op: HodlBondsTradeOp.UNISWAP_EXACT_IN,
      clientOrderId: this.tradeConfig.clientOrderId,
      poolAddress: this.tradeConfig.vaultAddress,
      quantity: this.inputToken.parse(this.tradeConfig.size).toString(),
      minAmountOut: params.minAmountOut.toString(),
      deadline: Number(params.deadline),
      zeroForOne: this.zeroForOne,
    })

    console.log("Published HodlBonds trade message with ID:", messageId)

    return messageId

    // Wait for swap event
    // const poolManagerContract = contractMap.poolManager.contract(params.chainId)
    // type SwapEvent = ExtractAbiEvent<typeof poolManagerAbi, 'Swap'>
    // type SwapEventLog = GetLogsReturnType<SwapEvent, [SwapEvent], true>[number]

    // const swapLog = await new Promise<SwapEventLog>((resolve, reject) => {
    //   const timeoutId = setTimeout(
    //     () => {
    //       unwatch?.()
    //       reject(errors.internal('Swap event timeout'))
    //     },
    //     15 * 60 * 1000
    //   )

    //   const unwatch = poolManagerContract.watchEvent.Swap(
    //     {},
    //     {
    //       onLogs: logs => {
    //         const log = logs[0]
    //         try {
    //           const decoded = decodeEventLog({
    //             abi: poolManagerAbi,
    //             eventName: 'Swap',
    //             data: log.data,
    //             topics: log.topics,
    //           })
    //           clearTimeout(timeoutId)
    //           unwatch()
    //           resolve({ ...log, args: decoded.args })
    //         } catch (e) {
    //           clearTimeout(timeoutId)
    //           unwatch()
    //           reject(e)
    //         }
    //       },
    //       onError: err => {
    //         clearTimeout(timeoutId)
    //         unwatch()
    //         reject(err)
    //       },
    //     }
    //   )
    // })

    // const amountSentRaw = params.zeroForOne ? swapLog.args.amount0 : swapLog.args.amount1
    // const amountReceivedRaw = params.zeroForOne ? swapLog.args.amount1 : swapLog.args.amount0

    // return {
    //   amountSent: -amountSentRaw,
    //   amountReceived: amountReceivedRaw,
    //   newPrice: swapLog.args.sqrtPriceX96,
    // }

    // Use known swap direction instead of checking signs
    // zeroForOne tells us: true = currency0 → currency1, false = currency1 → currency0
    // Pool deltas: negative = user sent (left pool), positive = user received (entered pool)
    // const amountSentRaw = zeroForOne ? swapArgs.amount0 : swapArgs.amount1
    // const amountReceivedRaw = zeroForOne ? swapArgs.amount1 : swapArgs.amount0

    // // Format amounts using token format methods (negate sent amount since it's negative in the event)
    // const amountSent = inputToken.format(-amountSentRaw)
    // const amountReceived = outputToken.format(amountReceivedRaw)

    // // Convert sqrtPriceX96 to human-readable price
    // // Pool price is always currency1/currency0
    // // For consistency, we want to show price as stable/vault (stablecoin per vault token)
    // // If vault is currency0: pool price = currency1/currency0 = stable/vault ✓ (no inversion needed)
    // // If vault is currency1: pool price = currency1/currency0 = vault/stable ✗ (need to invert to get stable/vault)
    // const priceObj = new Price(swapArgs.sqrtPriceX96, currency0Details.decimals, currency1Details.decimals)
    // const newPoolPrice = vaultIsCurrency0 ? priceObj.toFixed(6) : priceObj.invert().toFixed(6)

    // // Calculate avgPrice: how much received per unit sent
    // const avgPrice = Math.abs(Number(amountReceivedRaw)) / Math.abs(Number(amountSentRaw))

    // console.log('Swap execution details:', {
    //   amountSent,
    //   amountReceived,
    //   avgPrice: avgPrice.toFixed(6),
    //   newPoolPrice,
    // })

    // const response: CreateOrderResponse = {
    //   chainId: String(chainId),
    //   symbol: `${currency0Details.symbol}/${currency1Details.symbol}`,
    //   side,
    //   size,
    //   amountSent,
    //   amountReceived,
    //   avgPrice: avgPrice.toFixed(6),
    //   newPoolPrice,
    // }
  }
}

import {
  type DcaBotBuyOrder,
  DcaBotTask,
  Task,
} from "@dreamx-development/hodlbonds-blockchain-executor-dto"
import { Contract, ethers, type Signer } from "ethers"

import { DcaBotCommon, type DcaValues } from "./DcaBotCommon"

/**
 * This class represents a DCA Bot which executes DCA tasks.
 * @extends ExecutorAbstract
 */
export class DcaBot extends DcaBotCommon {
  /**
   * Loops through all active buyOrders filling the arrays that are passed to the contract
   *
   * @param {Task} task - The DCA task to process
   * @param {Signer} signer - The signer to use for contract interactions
   * @return {Promise<DcaValues>} - An object containing the filled arrays
   */
  async processDcaTask(task: Task, signer: Signer): Promise<DcaValues> {
    const dcaTask: DcaBotTask = DcaBotTask.fromTask(task)
    const uniFactory = await this.getContract("UniswapV2Factory", task.network, signer)

    const tokenToSell = dcaTask.data.tokenToSell
    const tokenToSellDollarPrice = await this.getTokenToSellDollarPrice(dcaTask, signer, uniFactory)

    this.logger.info(
      `Token to sell: ${tokenToSell} Dollar price: ${tokenToSellDollarPrice.toString()}`,
    )

    const fromAddresses: string[] = []
    const toAddresses: string[] = []
    const tokenAmountsPerRun: bigint[] = []

    for (const buyOrder of dcaTask.data.buyOrders) {
      if (buyOrder.active) {
        // oxlint-disable-next-line no-await-in-loop
        const amountTokensToBuy = await this.processBuyOrder(
          uniFactory,
          buyOrder,
          signer,
          tokenToSellDollarPrice,
          dcaTask,
        )

        fromAddresses.push(tokenToSell)
        tokenAmountsPerRun.push(amountTokensToBuy)
        toAddresses.push(buyOrder.address)
      } else {
        this.logger.info(`Skipping buy order since it's not active: ${buyOrder.address}`)
      }
    }
    return { fromAddresses, toAddresses, tokenAmountsPerRun }
  }

  /**
   * Processes a buy order by calculating the amount of tokens to buy.
   *
   * @param {Contract} uniFactory - The UniSwap factory contract.
   * @param {DcaBotBuyOrder} buyOrder - The buy order object.
   * @param {Signer} signer - The signer object.
   * @param {number} tokenToSellDollarPrice - The dollar price of the token to sell.
   * @param {DcaBotTask} dcaTask - The DCA bot task object.
   * @return {Promise<bigint>} - The amount of tokens to buy.
   */
  async processBuyOrder(
    uniFactory: Contract,
    buyOrder: DcaBotBuyOrder,
    signer: Signer,
    tokenToSellDollarPrice: number,
    dcaTask: DcaBotTask,
  ): Promise<bigint> {
    const { tokenToSell, tokenToSellDecimals } = dcaTask.data
    const lpAddress = await uniFactory["getPair"]?.(tokenToSell, buyOrder.address)
    const lpPair = await this.getContract("UniswapV2Pair", dcaTask.network, signer, lpAddress)

    const token0 = await lpPair["token0"]?.()
    const reserves = await lpPair["getReserves"]?.()
    const [reserve0, reserve1] = reserves

    const exchangeRate =
      token0.toLowerCase() === tokenToSell.toLowerCase()
        ? this.calcExchangeRate(reserve1, buyOrder.decimals, reserve0, tokenToSellDecimals)
        : this.calcExchangeRate(reserve0, buyOrder.decimals, reserve1, tokenToSellDecimals)

    const tokensToBuy = this.roundNumber(
      (buyOrder.dollarAmount / tokenToSellDollarPrice) * exchangeRate,
      buyOrder.decimals,
    )

    this.logger.info(
      `parseUnits: roundNumber(${buyOrder.dollarAmount} / ${tokenToSellDollarPrice} * ${exchangeRate})) = ${tokensToBuy} decimals: ${buyOrder.decimals} `,
    )

    return ethers.parseUnits(tokensToBuy.toString(), buyOrder.decimals)
  }

  /**
   * Calculates the price of a token to sell in terms of base dollar token.
   *
   * @param {DcaBotTask} dcaBotTask The task object.
   * @param {Signer} signer The signer object.
   * @param {Contract} uniFactory The UniSwap factory contract object.
   * @return {Promise<number>} The price of the token to sell in terms of base dollar token.
   */
  async getTokenToSellDollarPrice(
    dcaBotTask: DcaBotTask,
    signer: Signer,
    uniFactory: Contract,
  ): Promise<number> {
    const { tokenToSell, tokenToSellDecimals, baseDollarToken, baseDollarDecimals } =
      dcaBotTask.data

    const baseLpAddress = await uniFactory["getPair"]?.(tokenToSell, baseDollarToken)
    const baseLpPair = await this.getContract(
      "UniswapV2Pair",
      dcaBotTask.network,
      signer,
      baseLpAddress,
    )

    const token0 = await baseLpPair["token0"]?.()
    const reserves = await baseLpPair["getReserves"]?.()
    const [reserve0, reserve1] = reserves

    return token0.toLowerCase() === tokenToSell.toLowerCase()
      ? this.calcExchangeRate(reserve1, baseDollarDecimals, reserve0, tokenToSellDecimals)
      : this.calcExchangeRate(reserve0, baseDollarDecimals, reserve1, tokenToSellDecimals)
  }

  /**
   * Reduce the amount of decimals with integer division
   * @param {number} num
   * @param {number} dec
   * @return {number}
   */
  roundNumber(num: number, dec: number): number {
    return Math.round(num * Math.pow(10, dec)) / Math.pow(10, dec)
  }
}

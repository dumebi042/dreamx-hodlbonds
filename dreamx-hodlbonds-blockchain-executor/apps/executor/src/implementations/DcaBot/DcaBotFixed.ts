import {
  type DcaBotFixedBuyOrder,
  DcaBotFixedTask,
  Task,
} from "@dreamx-development/hodlbonds-blockchain-executor-dto"
import { Contract, ethers, type Signer } from "ethers"

import { DcaBotCommon, type DcaValues } from "./DcaBotCommon"

/**
 *
 */
export class DcaBotFixed extends DcaBotCommon {
  /**
   *
   * @param {Task} task
   * @param {Signer} signer
   * @return {Promise<DcaValues>}
   */
  async processDcaTask(task: Task, signer: Signer): Promise<DcaValues> {
    const dcaFixedTask: DcaBotFixedTask = DcaBotFixedTask.fromTask(task)
    const uniFactory = await this.getContract("UniswapV2Factory", task.network, signer)

    const tokenToSell = dcaFixedTask.data.tokenToSell

    const fromAddresses: string[] = []
    const toAddresses: string[] = []
    const tokenAmountsPerRun: bigint[] = []

    for (const buyOrder of dcaFixedTask.data.buyOrders) {
      if (buyOrder.active) {
        // oxlint-disable-next-line no-await-in-loop
        const amountTokensToBuy = await this.processBuyOrder(
          uniFactory,
          buyOrder,
          signer,
          dcaFixedTask,
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
   * @param {DcaBotFixedBuyOrder} buyOrder - The buy order object.
   * @param {Signer} signer - The signer object.
   * @param {DcaBotFixedTask} dcaFixedTask - The DCA bot task object.
   * @return {Promise<bigint>} - The amount of tokens to buy.
   */
  async processBuyOrder(
    uniFactory: Contract,
    buyOrder: DcaBotFixedBuyOrder,
    signer: Signer,
    dcaFixedTask: DcaBotFixedTask,
  ): Promise<bigint> {
    const { tokenToSell, tokenToSellDecimals } = dcaFixedTask.data
    const lpAddress = await uniFactory["getPair"]?.(tokenToSell, buyOrder.address)
    const lpPair = await this.getContract("UniswapV2Pair", dcaFixedTask.network, signer, lpAddress)

    const token0 = await lpPair["token0"]?.()
    const reserves = await lpPair["getReserves"]?.()
    const [reserve0, reserve1] = reserves

    const exchangeRate =
      token0.toLowerCase() === tokenToSell.toLowerCase()
        ? this.calcExchangeRate(reserve1, buyOrder.decimals, reserve0, tokenToSellDecimals)
        : this.calcExchangeRate(reserve0, buyOrder.decimals, reserve1, tokenToSellDecimals)

    const tokensToBuy = buyOrder.tokenToSellAmount * exchangeRate

    return ethers.parseUnits(tokensToBuy.toFixed(buyOrder.decimals).toString(), buyOrder.decimals)
  }
}

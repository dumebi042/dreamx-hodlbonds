import type { HodlBondsTradeData } from "@dreamx-development/hodlbonds-blockchain-executor-dto"

import {
  Executor,
  HodlBondsTradeMessage,
  Network,
} from "@dreamx-development/hodlbonds-blockchain-executor-dto"

import { BlockchainExecutorClient } from "../BlockchainExecutorClient"

export class HodlBondsTradeClient extends BlockchainExecutorClient {
  constructor(topic: string | null = null) {
    super(topic)
  }

  async publishHodlBondsTradeUpdate(network: Network, data: HodlBondsTradeData): Promise<string> {
    const now = Math.floor(Date.now() / 1000)

    return await this.publishMessage(
      new HodlBondsTradeMessage({
        earliestTry: now,
        latestTry: data.deadline,
        executor: Executor.HodlBondsTrade,
        network,
        priority: 100,
        shouldRetry: true,
        data,
      }),
    )
  }
}

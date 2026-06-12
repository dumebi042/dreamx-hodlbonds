import type { Executor } from "@dreamx-development/hodlbonds-blockchain-executor-dto"

import type { MerkleTreeManager } from "./MerkleTreeManager"
import type { ExecutorConfig } from "./schemas"

import { ExecutorAbstract } from "./ExecutorAbstract"
import { DcaBot } from "./implementations/DcaBot/DcaBot"
import { DcaBotFixed } from "./implementations/DcaBot/DcaBotFixed"
import { HodlBondsTrade } from "./implementations/HodlBondsTrade"

export class ExecutorFactory {
  private merkleTreeManager: MerkleTreeManager

  /**
   * Create an ExecutorFactory
   * @param {MerkleTreeManager} merkleTreeManager - Merkle tree manager for proof generation
   */
  constructor(merkleTreeManager: MerkleTreeManager) {
    this.merkleTreeManager = merkleTreeManager
  }

  getExecutor(executorName: Executor, config: ExecutorConfig): ExecutorAbstract {
    switch (executorName) {
      case "DcaBot":
        return new DcaBot(config)

      case "DcaBotFixed":
        return new DcaBotFixed(config)

      case "HodlBondsTrade":
        return new HodlBondsTrade(config, this.merkleTreeManager)
    }

    throw new Error(`Unknown Executor ${executorName}`)
  }
}

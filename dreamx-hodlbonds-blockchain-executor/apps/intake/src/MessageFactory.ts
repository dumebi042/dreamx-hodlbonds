import {
  DcaBotFixedMessage,
  DcaBotMessage,
  Executor,
  HodlBondsTradeMessage,
  Message,
} from "@dreamx-development/hodlbonds-blockchain-executor-dto"

export class MessageFactory {
  executor: Executor

  constructor(executor: Executor) {
    if (Object.values(Executor).indexOf(executor) === -1) {
      throw new Error(`Unknown Executor: ${executor}`)
    }

    this.executor = executor
  }

  createMessage(pubSubMessage: any): Message {
    switch (this.executor) {
      case Executor.HodlBondsTrade:
        return new HodlBondsTradeMessage(pubSubMessage)

      case Executor.DcaBot:
        return new DcaBotMessage(pubSubMessage)

      case Executor.DcaBotFixed:
        return new DcaBotFixedMessage(pubSubMessage)

      case Executor.UnitTest:
        return new Message(pubSubMessage)

      default:
        throw new Error(`Message for unknown executor: ${pubSubMessage.executor}`)
    }
  }
}

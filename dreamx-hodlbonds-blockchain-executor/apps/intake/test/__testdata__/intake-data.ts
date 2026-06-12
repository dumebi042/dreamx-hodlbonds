import {
  Executor,
  Network,
  type Message,
} from "@dreamx-development/hodlbonds-blockchain-executor-dto"

interface TestingTaskPubSubMessage extends Record<string, unknown> {
  datString: string
  dataNumber: number
}

export const regularMessage: Message<TestingTaskPubSubMessage> = {
  executor: Executor.UnitTest,
  priority: 111,
  earliestTry: 1691680555,
  latestTry: 1691681555,
  shouldRetry: false,
  network: Network.tst,
  data: { datString: "some string", dataNumber: 999 },
}

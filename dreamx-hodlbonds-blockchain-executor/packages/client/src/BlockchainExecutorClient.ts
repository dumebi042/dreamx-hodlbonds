import { Message } from "@dreamx-development/hodlbonds-blockchain-executor-dto"
import { PubSub, Topic } from "@google-cloud/pubsub"
import process from "node:process"

import { PubsubTopicPathSchema, type PubsubTopicPath } from "@/schemas"

export class BlockchainExecutorClient {
  executorTopic: Topic
  topicName: string

  constructor(topic: PubsubTopicPath | null = null) {
    const executorTopic = topic || process.env["EXECUTOR_PUBSUB_TOPIC"]

    if (!executorTopic || !PubsubTopicPathSchema.safeParse(executorTopic).success) {
      throw new Error(`Invalid pubsub topic path: ${executorTopic}`)
    }

    // Extract project ID from topic path: projects/PROJECT_ID/topics/TOPIC_NAME
    const parts = executorTopic.split("/")
    const projectId = parts[1]!
    const topicName = parts.at(-1)!

    this.executorTopic = new PubSub({ projectId }).topic(executorTopic)
    this.topicName = topicName
  }

  async publishMessage(message: Message): Promise<string> {
    const json = JSON.stringify(message, this.stringifyReplacer)
    const data = Buffer.from(json)
    return await this.executorTopic.publishMessage({ data })
  }

  stringifyReplacer(_: string, value: any) {
    return typeof value === "bigint" ? value.toString() : value
  }
}

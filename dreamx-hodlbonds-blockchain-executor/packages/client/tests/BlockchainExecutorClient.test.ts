import { Executor, Message, Network } from "@dreamx-development/hodlbonds-blockchain-executor-dto"
import { PubSub, Topic } from "@google-cloud/pubsub"
import process from "node:process"
import { beforeEach, describe, expect, it, vi, type MockedClass } from "vitest"

import { BlockchainExecutorClient } from "@/BlockchainExecutorClient"

const mockTopic = vi.fn().mockReturnValue({ name: "mock-topic" }) as unknown as Topic

vi.mock("@google-cloud/pubsub", () => {
  return {
    PubSub: vi.fn().mockImplementation(function () {
      return {
        topic: mockTopic,
      }
    }),
  }
})

let mockTopicName: string
let mockTopicPath: string

describe("BlockchainExecutorClient", () => {
  beforeEach(() => {
    mockTopicName = "mock-topic"
    mockTopicPath = `projects/my-project-id/topics/${mockTopicName}`
    process.env["EXECUTOR_PUBSUB_TOPIC"] = mockTopicPath
  })

  it("constructor: Creates instance and sets up topic successfully", () => {
    expect.assertions(4)

    const client = new BlockchainExecutorClient()

    expect(client.constructor.name).toBe("BlockchainExecutorClient")

    const mockPubSubInstance = PubSub as MockedClass<typeof PubSub>
    expect(mockPubSubInstance.mock.calls.length).toBe(1)
    expect(mockTopic).toHaveBeenCalledWith(mockTopicPath)

    expect(client.topicName).toBe(mockTopicName)
  })

  it("constructor: Throws on incorrect topic path", () => {
    expect.assertions(1)

    const mockTopicPath = "invalid path"
    process.env["EXECUTOR_PUBSUB_TOPIC"] = mockTopicPath

    expect(() => new BlockchainExecutorClient()).toThrow(
      `Invalid pubsub topic path: ${mockTopicPath}`,
    )
  })

  it("publishMessage: Happy path", async () => {
    expect.assertions(2)

    const mockMessage = {
      priority: 100,
      earliestTry: 1689167443,
      latestTry: null,
      shouldRetry: true,
      network: Network.tst,
      executor: Executor.UnitTest,
      data: {
        big: BigInt("12345678901234567890"),
      },
    } as Message

    const expectedMessage =
      '{"priority":100,"earliestTry":1689167443,"latestTry":null,"shouldRetry":true,"network":"tst","executor":"UnitTest","data":{"big":"12345678901234567890"}}'
    const mockPublishMessage = vi.fn(() => Promise.resolve("mock-message-id"))

    const client = new BlockchainExecutorClient()
    client.executorTopic = {
      publishMessage: mockPublishMessage,
    } as unknown as Topic

    const messageId = await client.publishMessage(mockMessage)
    expect(mockPublishMessage).toBeCalledWith({ data: Buffer.from(expectedMessage) })
    expect(messageId).toBe("mock-message-id")
  })
})

import { cloudEvent, type CloudEvent } from "@google-cloud/functions-framework"
import log4js from "log4js"
import { json } from "zod"

import { config } from "./config"
import { Intake } from "./Intake"

const isProduction = config.NODE_ENV === "production"

log4js.addLayout("gcp-json", () => {
  const severityMap: Record<string, string> = {
    TRACE: "DEBUG",
    DEBUG: "DEBUG",
    INFO: "INFO",
    WARN: "WARNING",
    ERROR: "ERROR",
    FATAL: "CRITICAL",
  }

  return (logEvent) => {
    const [message, ...additionalData] = logEvent.data

    const logData: Record<string, any> = {
      severity: severityMap[logEvent.level.levelStr] || logEvent.level.levelStr,
      "logging.googleapis.com/labels": {
        service: "Intake",
        component: logEvent.categoryName,
        executor: config.EXECUTOR,
        branch: config.BRANCH ?? "default",
      },
      message: typeof message === "string" ? message : JSON.stringify(message),
    }

    for (const data of additionalData) {
      if (data && typeof data === "object") {
        Object.assign(logData, data)
      }
    }

    return JSON.stringify(logData)
  }
})

log4js.configure({
  appenders: {
    out: {
      type: "stdout",
      layout: isProduction
        ? { type: "gcp-json" }
        : {
            type: "pattern",
            pattern: "[%d] [%p] %c - %m",
          },
    },
  },
  categories: { default: { appenders: ["out"], level: config.LOG_LEVEL } },
})

const logger = log4js.getLogger("IntakeMain")

const intake = new Intake()
await intake.initialize().catch((error) => {
  logger.fatal("Failed to initialize database connection. Shutting down...", { error })
  process.exit(1)
})

type CloudEventData = {
  message: { data: string }
}

cloudEvent<CloudEventData>(
  "blockchainExecutorIntake",
  async (cloudEvent: CloudEvent<CloudEventData>) => {
    const messageId = cloudEvent.id

    try {
      logger.info(`Processing message ${messageId}`, { messageId })

      const json = cloudEvent.data?.message?.data
        ? JSON.parse(Buffer.from(cloudEvent.data?.message?.data, "base64").toString())
        : {}

      logger.info(`Parsed JSON data for message ${messageId}`, { messageId, json })

      await intake.processMessage(messageId, { json })
    } catch (e: unknown) {
      if (e instanceof Error) {
        logger.error(`Exception processing message ${messageId}`, {
          messageId,
          error: e.message,
          stack: e.stack,
          errorName: e.name,
          rawData: cloudEvent.data?.message?.data,
          json,
        })
      } else {
        logger.error(`Non-Error exception processing message ${messageId}`, {
          messageId,
          exception: e,
          exceptionType: typeof e,
          rawData: cloudEvent.data?.message?.data,
          json,
        })
      }
      throw e
    }
  },
)

import log4js from "log4js"
import fs from "node:fs"
import path from "node:path"

import { baseConfig } from "./config"
import { ExecutionManager } from "./ExecutionManager"
import { ConfigSchema } from "./schemas"
import { WalletManager } from "./WalletManager"

const configPath = baseConfig.BLOCKCHAIN_EXECUTOR_CONFIG

if (!fs.existsSync(configPath)) {
  throw new Error(`Missing config file at ${configPath}`)
}

const logFile = path.join(
  path.dirname(configPath),
  "..",
  "logs",
  `${path.basename(configPath, ".json")}.log`,
)

const rawConfig = JSON.parse(fs.readFileSync(configPath, "utf8"))
const config = ConfigSchema.parse(rawConfig)
const isProduction = baseConfig.NODE_ENV === "production"
let shutdownTimer = 60 * 1000

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

    const logData = {
      "logging.googleapis.com/severity": severityMap[logEvent.level.levelStr] || "DEFAULT",
      "logging.googleapis.com/labels": {
        service: "Executor",
        component: logEvent.categoryName,
        server: config.serverName,
        network: config.networkName,
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
            pattern: "[%d] [%p] %c - %x{server} %x{network}: %m",
            tokens: {
              network: () => config.networkName,
              server: () => config.serverName,
            },
          },
    },
    default: {
      type: "dateFile",
      filename: logFile,
      pattern: "yyyy-MM-dd",
      numBackups: config.numLogBackups || 30,
      compress: true,
    },
  },
  categories: { default: { appenders: ["out"], level: baseConfig.LOG_LEVEL } },
})

const logger = log4js.getLogger("Main")

const walletManager = new WalletManager(config.walletManager)
const executionManager = new ExecutionManager(config.executionManager, walletManager)

try {
  await walletManager.start()
  await executionManager.start()
  logger.info("Startup complete!", {
    server: config.serverName,
    network: config.networkName,
  })
} catch (err) {
  logger.error("Startup failed", {
    server: config.serverName,
    network: config.networkName,
    error: err,
  })
  await shutdown()
}

async function shutdown() {
  const shutdownPromises = [walletManager.shutdown(), executionManager.shutdown()]

  const forcedShutdownInterval = setInterval(() => {
    shutdownTimer -= 10000
    logger.warn(`Forced shutdown in ${(shutdownTimer / 1000).toFixed(0)} seconds`, {
      server: config.serverName,
      network: config.networkName,
    })

    if (shutdownTimer <= 0) {
      clearInterval(forcedShutdownInterval)
      logger.error("Shutdown unsuccessful, forcing exit", {
        server: config.serverName,
        network: config.networkName,
      })
      process.exit()
    }
  }, 10000)
  await Promise.all(shutdownPromises)
  logger.info("Shutdown successful", {
    server: config.serverName,
    network: config.networkName,
  })
  process.exit()
}

process.on("SIGINT", async function () {
  logger.warn("Caught interrupt signal, starting shutdown sequence", {
    server: config.serverName,
    network: config.networkName,
  })

  await shutdown()
})
process.on("SIGTERM", async function () {
  logger.warn("Caught termination signal, starting shutdown sequence", {
    server: config.serverName,
    network: config.networkName,
  })

  await shutdown()
})

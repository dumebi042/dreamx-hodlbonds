import {
  createDb,
  createDbWithConnectionDetails,
  type Db,
} from "@dreamx-development/hodlbonds-blockchain-executor-database"
import log4js, { type Logger } from "log4js"

import { config } from "@/config"

let providerInstance: DatabaseProvider

export function getDatabaseProvider(): DatabaseProvider {
  if (!providerInstance) {
    providerInstance = new DatabaseProvider()
  }

  return providerInstance
}

export class DatabaseProvider {
  db: Db | null = null
  logger: Logger

  constructor() {
    this.logger = log4js.getLogger("DatabaseProvider")
  }

  async initialize(): Promise<void> {
    if (this.db === null) {
      this.logger.debug("Connecting to database...")
      if (config.NODE_ENV === "production") {
        this.db = await createDbWithConnectionDetails({
          user: config.DB_USER,
          instanceId: config.DB_INSTANCE_ID,
          database: config.DB_NAME,
        })
      } else {
        const databaseUrl = process.env["DATABASE_URL"]
        if (!databaseUrl) {
          throw new Error(
            "DATABASE_URL environment variable is not set. Please set it to connect to the database in non-production environments.",
          )
        }
        this.db = createDb(databaseUrl)
      }
      this.logger.debug("Connected to database")
    }
  }

  getDb(): Db {
    if (!this.db) {
      throw new Error("Database not initialized. Call initialize() first.")
    }
    return this.db
  }
}

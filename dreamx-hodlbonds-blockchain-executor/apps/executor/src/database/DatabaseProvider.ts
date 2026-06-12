import { createDb, type Db } from "@dreamx-development/hodlbonds-blockchain-executor-database"
import log4js, { type Logger } from "log4js"

import { baseConfig } from "@/config"

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

  connect(): Db {
    return createDb(baseConfig.DATABASE_URL)
  }

  getDb(): Db {
    if (this.db === null) {
      this.db = this.connect()
    }

    if (this.db) {
      return this.db
    }
    throw new Error("Unable to connect to database")
  }
}

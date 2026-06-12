import {
  createDb,
  createDbWithConnectionDetails,
} from "@dreamx-development/hodlbonds-blockchain-executor-database"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { config } from "@/config"
import { DatabaseProvider, getDatabaseProvider } from "@/database/DatabaseProvider"

vi.mock("@dreamx-development/hodlbonds-blockchain-executor-database", () => ({
  createDb: vi.fn(),
  createDbWithConnectionDetails: vi.fn(),
}))

vi.mock("@/config", () => ({
  config: {
    NODE_ENV: "development",
    DB_USER: "test-user",
    DB_INSTANCE_ID: "test-instance",
    DB_NAME: "test-db",
  },
}))

const mockDb = { query: {} } as any

describe("DatabaseProvider", () => {
  let originalEnv: string | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    originalEnv = process.env["DATABASE_URL"]
    // Reset the singleton instance before each test
    const provider = getDatabaseProvider()
    provider.db = null
  })

  afterEach(() => {
    if (originalEnv) {
      delete process.env["DATABASE_URL"]
    } else {
      process.env["DATABASE_URL"] = originalEnv
    }
  })

  describe("getDatabaseProvider", () => {
    it("returns a singleton instance", () => {
      const provider1 = getDatabaseProvider()
      const provider2 = getDatabaseProvider()

      expect(provider1).toBe(provider2)
      expect(provider1).toBeInstanceOf(DatabaseProvider)
    })
  })

  describe("DatabaseProvider class", () => {
    it("constructs with logger initialized", () => {
      const provider = new DatabaseProvider()

      expect(provider.db).toBeNull()
      expect(provider.logger).toBeDefined()
    })
  })

  describe("initialize", () => {
    it("initializes db in non-production with DATABASE_URL set", async () => {
      process.env["DATABASE_URL"] = "postgresql://test:test@localhost:5432/testdb"
      vi.mocked(createDb).mockReturnValue(mockDb)

      const provider = getDatabaseProvider()
      const debugSpy = vi.spyOn(provider.logger, "debug")

      await provider.initialize()

      expect(createDb).toHaveBeenCalledWith("postgresql://test:test@localhost:5432/testdb")
      expect(provider.db).toBe(mockDb)
      expect(debugSpy).toHaveBeenCalledWith("Connecting to database...")
      expect(debugSpy).toHaveBeenCalledWith("Connected to database")
    })

    it("throws error in non-production when DATABASE_URL is not set", async () => {
      delete process.env["DATABASE_URL"]

      const provider = getDatabaseProvider()
      provider.db = null

      await expect(provider.initialize()).rejects.toThrow(
        "DATABASE_URL environment variable is not set. Please set it to connect to the database in non-production environments.",
      )
    })

    it("initializes db in production mode", async () => {
      process.env["DATABASE_URL"] = "postgresql://test:test@localhost:5432/testdb"
      vi.mocked(createDbWithConnectionDetails).mockResolvedValue(mockDb)
      vi.mocked(config).NODE_ENV = "production"

      const provider = getDatabaseProvider()
      provider.db = null
      const debugSpy = vi.spyOn(provider.logger, "debug")

      await provider.initialize()

      expect(createDbWithConnectionDetails).toHaveBeenCalledWith({
        user: "test-user",
        instanceId: "test-instance",
        database: "test-db",
      })
      expect(provider.db).toBe(mockDb)
      expect(debugSpy).toHaveBeenCalledWith("Connecting to database...")
      expect(debugSpy).toHaveBeenCalledWith("Connected to database")

      // Reset NODE_ENV
      vi.mocked(config).NODE_ENV = "development"
    })

    it("does not reinitialize when db is already initialized", async () => {
      process.env["DATABASE_URL"] = "postgresql://test:test@localhost:5432/testdb"
      vi.mocked(createDb).mockReturnValue(mockDb)

      const provider = getDatabaseProvider()
      provider.db = mockDb
      const debugSpy = vi.spyOn(provider.logger, "debug")

      await provider.initialize()

      expect(createDb).not.toHaveBeenCalled()
      expect(debugSpy).not.toHaveBeenCalled()
    })
  })

  describe("getDb", () => {
    it("returns db when initialized", async () => {
      process.env["DATABASE_URL"] = "postgresql://test:test@localhost:5432/testdb"
      vi.mocked(createDb).mockReturnValue(mockDb)

      const provider = getDatabaseProvider()
      await provider.initialize()

      const db = provider.getDb()

      expect(db).toBe(mockDb)
    })

    it("throws error when db is not initialized", () => {
      const provider = getDatabaseProvider()
      provider.db = null

      expect(() => provider.getDb()).toThrow("Database not initialized. Call initialize() first.")
    })
  })
})

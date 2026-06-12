import { AuthTypes, Connector, IpAddressTypes } from "@google-cloud/cloud-sql-connector"
import { env } from "@hodlbonds-api/env/intake"
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

import { schema, type Schema } from "./schema"

// Singleton database instance
let _db: NodePgDatabase<Schema> | null = null

/**
 * Gets the database instance.
 * For local dev (DATABASE_URL set, no Cloud SQL), lazily initializes on first call.
 * For Cloud SQL, requires initDb() to be called first.
 */
export function getDb(): NodePgDatabase<Schema> {
  if (!_db) {
    // For local dev with DATABASE_URL, lazily initialize (like the old proxy)
    if (env.DATABASE_URL && !env.CLOUD_SQL_INSTANCE) {
      _db = drizzle({ connection: env.DATABASE_URL, schema })
    } else {
      throw new Error("Database not initialized. Call initDb() first.")
    }
  }
  return _db
}

/**
 * Creates a database connection using a connection string.
 * Useful for tests or custom connections.
 */
export function createDb(connectionString: string): NodePgDatabase<Schema> {
  return drizzle({ connection: connectionString, schema })
}

/**
 * Creates a database connection using Cloud SQL IAM authentication.
 * Used in Cloud Run where we have:
 * - CLOUD_SQL_INSTANCE: e.g. "project:region:instance"
 * - DB_IAM_USER: e.g. "service-account@project.iam"
 * - DB_NAME: e.g. "hodlbonds_api_stage"
 */
async function createCloudSqlDb(): Promise<NodePgDatabase<Schema>> {
  const connector = new Connector()
  const clientOpts = await connector.getOptions({
    instanceConnectionName: env.CLOUD_SQL_INSTANCE!,
    ipType: IpAddressTypes.PUBLIC,
    authType: AuthTypes.IAM,
  })

  const pool = new Pool({
    ...clientOpts,
    user: env.DB_IAM_USER,
    database: env.DB_NAME,
    max: env.DB_POOL_MAX,
  })

  return drizzle({ client: pool, schema })
}

/**
 * Initializes the database connection singleton.
 * Call this once at application startup.
 * - In production with Cloud SQL: uses IAM authentication via connector
 * - In development: uses DATABASE_URL directly
 */
export async function initDb(): Promise<NodePgDatabase<Schema>> {
  if (_db) {
    console.log("Database already initialized, returning existing connection")
    return _db
  }

  // Use Cloud SQL connector if IAM config is present
  if (env.CLOUD_SQL_INSTANCE && env.DB_IAM_USER && env.DB_NAME) {
    console.log("Connecting to Cloud SQL with IAM authentication...")
    _db = await createCloudSqlDb()
  } else if (env.DATABASE_URL) {
    // Fall back to DATABASE_URL for local development
    console.log("Connecting via DATABASE_URL...")
    _db = drizzle({ connection: env.DATABASE_URL, schema })
  } else {
    throw new Error(
      "Database configuration missing. Provide either DATABASE_URL or all of: CLOUD_SQL_INSTANCE, DB_IAM_USER, DB_NAME",
    )
  }

  return _db
}

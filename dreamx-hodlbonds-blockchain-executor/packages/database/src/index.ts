import { Connector, IpAddressTypes, AuthTypes } from "@google-cloud/cloud-sql-connector"
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

import { schema } from "./db/schema"

export function createDb(connectionString: string): NodePgDatabase<typeof schema> {
  return drizzle({ connection: connectionString, schema })
}

export interface DbConfig {
  user: string
  instanceId: string
  database: string
}

export async function createDbWithConnectionDetails(
  config: DbConfig,
): Promise<NodePgDatabase<typeof schema>> {
  const { user, instanceId, database } = config

  const connector = new Connector()
  const clientOpts = await connector.getOptions({
    instanceConnectionName: instanceId,
    ipType: IpAddressTypes.PUBLIC,
    authType: AuthTypes.IAM,
  })

  const pool = new Pool({
    ...clientOpts,
    user,
    database,
    max: 5,
  })
  return drizzle(pool, { schema })
}

export type Db = NodePgDatabase<typeof schema>
export { schema }

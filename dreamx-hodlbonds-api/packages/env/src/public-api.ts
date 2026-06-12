import "dotenv/config"
import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

export const env = createEnv({
  server: {
    // Local development: use DATABASE_URL
    // Optional if using Cloud SQL IAM auth instead
    DATABASE_URL: z.string().min(1).optional(),

    // Cloud SQL IAM auth (Cloud Run): all three required together
    CLOUD_SQL_INSTANCE: z.string().optional(), // e.g. "project:region:instance"
    DB_IAM_USER: z.string().optional(), // e.g. "service-account@project.iam"
    DB_NAME: z.string().optional(), // e.g. "hodlbonds_api_stage"

    // Connection pool settings
    DB_POOL_MAX: z.coerce.number().default(5), // Max connections per instance

    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().default(3001),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
})

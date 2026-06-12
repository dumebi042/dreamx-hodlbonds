import { Executor } from "@dreamx-development/hodlbonds-blockchain-executor-dto"
import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import * as z from "zod"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.resolve(__dirname, "../..", ".env")

if (existsSync(envPath)) {
  process.loadEnvFile(envPath)
}

const ConfigSchema = z.object({
  DB_USER: z.string().min(1),
  DB_INSTANCE_ID: z.string().min(1),
  DB_NAME: z.string().min(1),
  EXECUTOR: z.enum(Executor),
  BRANCH: z.string().optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
})

export const config = ConfigSchema.parse(process.env)

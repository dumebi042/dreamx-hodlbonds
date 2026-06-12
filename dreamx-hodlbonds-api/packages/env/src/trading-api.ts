import "dotenv/config"
import { createEnv } from "@t3-oss/env-core"
import { getAddress } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { z } from "zod"

const DEFAULT_PORT = 3001

export const EthereumAddressSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^0x[a-fA-F0-9]{40}$/, "Must be a valid Ethereum address")
  .transform((val) => getAddress(val))

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
    PORT: z.coerce.number().default(DEFAULT_PORT),
    CORS_ORIGIN: z.string().default(`http://localhost:${DEFAULT_PORT}`),

    PRIVATE_KEY: z
      .string()
      .regex(/^0x[a-fA-F0-9]{64}$/, "PRIVATE_KEY must be 0x + 64 hex characters")
      .refine((val) => {
        try {
          privateKeyToAccount(val as `0x${string}`)
          return true
        } catch {
          return false
        }
      }, "PRIVATE_KEY is not a valid secp256k1 key")
      .transform((val) => val as `0x${string}`)
      .optional(),
    PUBLIC_KEY: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/, "PUBLIC_KEY must be 0x + 40 hex characters")
      .transform((val) => val as `0x${string}`)
      .optional(),
    API_KEYS: z
      .string()
      .optional()
      .transform((str) => {
        const keysMap = new Map<string, string>()

        if (!str) {
          return keysMap
        }

        // Format: "keyId1:secret1,keyId2:secret2"
        const pairs = str
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean)

        for (const pair of pairs) {
          const [keyId, secret] = pair.split(":").map((s) => s.trim())
          if (!keyId || !secret) {
            continue
          }
          keysMap.set(keyId, secret)
        }

        return keysMap
      }),
    EXECUTOR_PUBSUB_TOPIC: z
      .string()
      .regex(
        /^projects\/[-\w]+\/topics\/[-\w]+$/,
        "EXECUTOR_PUBSUB_TOPIC must be a valid Pub/Sub topic path",
      )
      .optional(),
    SERVICE_URL: z.url(),
    PUBSUB_SERVICE_ACCOUNT_EMAIL: z.email(),
    EXECUTOR_ADDRESSES: z
      .string()
      .min(1, "EXECUTOR_ADDRESSES must contain at least one address")
      .transform((str) => {
        const addresses = str
          .split(",")
          .map((addr) => addr.trim())
          .filter(Boolean)
        return addresses.map((addr) => EthereumAddressSchema.parse(addr))
      }),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
})

import { Network } from "@dreamx-development/hodlbonds-blockchain-executor-dto"
import * as z from "zod"

import { regexDecimalNumber, regexAlphaNumericString } from "@/utils/Regex"

export const BaseConfigSchema = z.object({
  BLOCKCHAIN_EXECUTOR_CONFIG: z.string(),
  GCP_PROJECT_ID: z.string(),
  SEED_PHRASE_SECRET: z.string(),
  TRADING_API_STATUS_TOPIC: z
    .string()
    .regex(
      /^projects\/[-\w]+\/topics\/[-\w]+$/,
      "TRADING_API_STATUS_TOPIC must be a valid Pub/Sub topic path",
    ),
  DATABASE_URL: z.string().regex(/^postgres(?:ql)?:\/\/[^\s/$.?#].[^\s]*$/),
  NODE_ENV: z.enum(["development", "production", "test"]).optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
})

export const WalletManagerConfigSchema = z.object({
  providerEndpoint: z.url({ protocol: /^https$/, hostname: z.regexes.domain }), // RPC URL
  chainId: z.number().int().positive(),
  walletCount: z.number().int().positive(), // Number of working wallets
  walletOffset: z.number().int().positive(), // Starting HD index
  totalGlobalWalletCount: z.number().int().positive(), // Total executor wallets across all regions
  processReleasedWalletsDelay: z.number().int().positive(),
  refuelDelay: z.number().int().positive(),
  refuelAmount: z.string().regex(regexDecimalNumber), // Amount to send when refueling
  connectionCheckDelay: z.number().int().positive(),
  gasBalanceLowWaterMarkEther: z.string().regex(regexDecimalNumber), // Min balance (in ETH)
  wallet0GasBalanceLowWaterMarkEther: z.string().regex(regexDecimalNumber),
})

export const AlphaNumericStringSchema = z.string().regex(regexAlphaNumericString)

export enum ExecutorRegion {
  EU1 = "EU1",
  US1 = "US1",
}

const ExecutorConfigSchema = z.object({
  minimumGasPrice: z.string().regex(regexDecimalNumber), // gwei
  overBidPercent: z.number().int().positive().gte(100),
  maximumPriorityFeePerGas: z.string().regex(regexDecimalNumber), // gwei
})

export const ExecutionManagerConfigSchema = z.object({
  executorRegion: z.enum(ExecutorRegion),
  executorConfig: ExecutorConfigSchema,
  network: z.enum(Network),
  processQueueDelay: z.number().int().positive(),
  defaultRetryDeadline: AlphaNumericStringSchema, // interval (e.g. "1h", "30m")
  regionRetryBlockDeadline: AlphaNumericStringSchema, // interval (e.g. "1h", "30m")
  baseRetryInterval: z.number().int().positive(),
  maxRetryInterval: z.number().int().positive(),
})

export const ConfigSchema = z.object({
  serverName: z.string().regex(/^[A-Za-z0-9-]+$/), // e.g. "us-central1"
  networkName: z.string().regex(/^[a-z0-9-]+$/), // e.g. "eth-sepolia", "metis-sepolia"
  numLogBackups: z.number().int().nonnegative().optional(),
  walletManager: WalletManagerConfigSchema,
  executionManager: ExecutionManagerConfigSchema,
})

export type WalletManagerConfig = z.infer<typeof WalletManagerConfigSchema>
export type ExecutorConfig = z.infer<typeof ExecutorConfigSchema>
export type ExecutionManagerConfig = z.infer<typeof ExecutionManagerConfigSchema>

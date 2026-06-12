import type { z } from "@hono/zod-openapi"

import type { DexDetailsSchema, DexNameSchema, VaultStateSchema } from "@/schemas/bonds"

// Contract vault states (as stored in DB, from smart contract)
const CONTRACT_VAULT_STATES = ["BOND_ISSUANCE", "TRADING", "SETTLED"] as const
type ContractVaultState = (typeof CONTRACT_VAULT_STATES)[number]
export const contractStateToString = (value: number): ContractVaultState =>
  CONTRACT_VAULT_STATES[value] ?? "BOND_ISSUANCE"
// Vault state type (derived from schema)
export type VaultState = z.infer<typeof VaultStateSchema>

// DEX names
export const DEX_NAMES = ["LFJ", "Blackhole"] as const
export type DexName = z.infer<typeof DexNameSchema>
export type DexDetails = z.infer<typeof DexDetailsSchema>
export const dexIdToName = (dexId: number): DexName => DEX_NAMES[dexId] ?? "LFJ"

export const DEX_URLS: Record<DexName, string> = {
  LFJ: "https://lfj.gg/",
  Blackhole: "https://blackhole.xyz/",
}

import type { ContractVaultState, VaultState } from "@/types"

const HARVESTING_BUFFER = 86400n * 5n // 5 day buffer

export function getBondState(vaultState: ContractVaultState, tradingEndsAt: bigint): VaultState {
  switch (vaultState) {
    case "BOND_ISSUANCE":
      return "BOND_ISSUANCE"
    case "TRADING": {
      const currentTime = BigInt(Date.now()) / 1000n
      const harvestingTime = tradingEndsAt - HARVESTING_BUFFER
      if (currentTime < harvestingTime) {
        return "TRADING"
      } else if (currentTime >= harvestingTime && currentTime < tradingEndsAt) {
        return "HARVESTING"
      }
      return "CLAIM"
    }
    case "SETTLED":
      return "SETTLED"
  }
}

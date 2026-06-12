import type { TokenMap } from "./types"

import { vaultToken } from "./instances/vaultToken"

export const tokenMap: TokenMap = {
  vaultToken,
}

export * from "./types"
export * from "./utils"

// export { vaultToken }

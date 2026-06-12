import type { Address } from "viem/accounts"

import type { DexDetails, PrimaryDex } from "@/types"

const LFJ_DEX_INFO = (pairAddress: Address): DexDetails => {
  return {
    name: "LFJ",
    url: "https://lfj.gg/",
    pairAddress,
  }
}

const BLACKHOLE_DEX_INFO = (pairAddress: Address): DexDetails => {
  return {
    name: "Blackhole",
    url: "https://blackhole.xyz/",
    pairAddress,
  }
}

export function getDexInfo(
  dexId: PrimaryDex,
  lfjPair: Address,
  blackholePair: Address,
): {
  primaryDex: DexDetails
  secondaryDex: DexDetails
} {
  switch (dexId) {
    case "LFJ":
      return {
        primaryDex: LFJ_DEX_INFO(lfjPair),
        secondaryDex: BLACKHOLE_DEX_INFO(blackholePair),
      }
    case "BLACKHOLE":
      return {
        primaryDex: BLACKHOLE_DEX_INFO(blackholePair),
        secondaryDex: LFJ_DEX_INFO(lfjPair),
      }
  }
}

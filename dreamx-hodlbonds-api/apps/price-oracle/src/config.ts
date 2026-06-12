import type { ChainId } from "@hodlbonds-api/blockchain"

import { zeroAddress, type Address } from "viem"

export type OracleEntry = {
  tokenAddress: Address
  oracleAddress: Address
}

type OracleConfig = Record<ChainId, Record<string, OracleEntry>>

export const ORACLE_CONFIG: OracleConfig = {
  43113: {
    AVAX_USD: {
      tokenAddress: zeroAddress,
      oracleAddress: "0x5498BB86BC934c8D34FDA08E81D444153d0D06aD",
    },
  },
  43114: {
    AVAX_USD: {
      tokenAddress: zeroAddress,
      oracleAddress: "0x0A77230d17318075983913bC2145DB16C7366156",
    },
    BTC_USD: {
      tokenAddress: "0x152b9d0FdC40C096757F570A51E494bd4b943E50", // BTC.b
      oracleAddress: "0x2779D32d5166BAaa2B2b658333bA7e6Ec0C65743",
    },
    ETH_USD: {
      tokenAddress: "0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB", // WETH.e
      oracleAddress: "0x976B3D034E162d8bD72D6b9C989d545b839003b0",
    },
  },
  11155111: {},
}

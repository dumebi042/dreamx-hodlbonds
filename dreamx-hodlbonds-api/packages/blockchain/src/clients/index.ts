import type { Account, Chain, Transport } from "viem"

import { createPublicClient, http } from "viem"

import type { ChainId } from "../networks"

import { networks } from "../networks"

export type Client = ReturnType<typeof createPublicClient<Transport, Chain, Account>>
type Clients = {
  [key in ChainId]: Client
}

export const clients = Object.entries(networks).reduce<Clients>((acc, [key, chain]) => {
  acc[Number(key) as ChainId] = createPublicClient({
    batch: { multicall: { wait: 100 } },
    chain,
    transport: http(undefined, {
      timeout: 20000,
      retryCount: 3,
      retryDelay: 1000,
      batch: { wait: 100 },
    }),
  })
  return acc
}, {} as Clients)

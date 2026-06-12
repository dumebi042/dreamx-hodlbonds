import { zeroAddress, type Address } from "viem"

import type { ChainId } from "../../networks"
import type { NativeToken, Token } from "../types"

import { tokenMap } from ".."
import { native } from "../../native"

interface GetTokenOptions {
  balance?: bigint
}

export function getTokenFromAddress(
  address: Address,
  chainId: ChainId,
  { balance }: GetTokenOptions = {},
): NativeToken | Token<any> | null {
  if (!chainId) return null

  if (address === zeroAddress) {
    const nativeToken = native(chainId)
    if (balance !== undefined) {
      return { ...nativeToken, balance }
    }
    return nativeToken
  }

  for (const [, object] of Object.entries(tokenMap)) {
    if (
      object.addresses[chainId] &&
      address.toLowerCase() === object.addresses[chainId].toLowerCase()
    ) {
      if (balance !== undefined) {
        return { ...object, balance }
      }
      return object
    }
  }

  return null
}

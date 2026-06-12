import type { ChainId } from "@hodlbonds-api/blockchain"
import type { NativeToken, Token } from "@hodlbonds-api/blockchain"

import { clients } from "@hodlbonds-api/blockchain"
import { contractMap } from "@hodlbonds-api/blockchain"
import { fetchErc20Details } from "@hodlbonds-api/blockchain"
import { getTokenFromAddress } from "@hodlbonds-api/blockchain"
import { InvalidAddressError, isAddress, type Address } from "viem"

import type { VaultBlockchain, TokenDetails } from "@/types"

import { withBlockchainError } from "@/lib/blockchain-error-handler"
import { errors } from "@/lib/errors"
import { VaultBlockchainSchema } from "@/schemas"
import { primaryDexToString, vaultStateToString } from "@/types"

import { getBondState } from "./utils"

/**
 * Helper to create token detail object from token and balance
 */
function createTokenDetails(address: Address, token: Token<any> | NativeToken, balance: bigint) {
  return {
    address,
    name: token.name,
    symbol: token.symbol,
    decimals: token.decimals,
    balance: token.format(balance),
  }
}

export async function vaultService({
  chainId,
  address,
}: {
  chainId: ChainId
  address: Address
}): Promise<VaultBlockchain> {
  if (!isAddress(address)) {
    const error = new InvalidAddressError({ address })
    throw errors.badRequest(error.shortMessage)
  }

  const client = clients[chainId]

  const [v, d, b, lbSwapData, blackholeSwapData] = await withBlockchainError(
    async () => {
      const poolContract = contractMap.dualTokenVault.contract(chainId, address)
      return await client.multicall({
        contracts: [
          { ...poolContract, functionName: "getVaultConfig" },
          { ...poolContract, functionName: "getVaultData" },
          { ...poolContract, functionName: "getVaultTokenBalance" },
          { ...poolContract, functionName: "getLBSwapData" },
          { ...poolContract, functionName: "getBlackholeSwapData" },
        ],
        allowFailure: false,
      })
    },
    { chainId, address },
  )

  const factoryContract = contractMap.dualTokenVaultFactory.contract(chainId)
  const factoryVaultData = await withBlockchainError(
    async () => await factoryContract.read.getVault([v.vaultId]),
    { chainId, address },
  )
  const pairData = await withBlockchainError(
    async () =>
      await factoryContract.read.getApprovedPair([
        BigInt(factoryVaultData.vaultCreationData.userConfig.pairId),
      ]),
    { chainId, address },
  )

  if (!pairData) {
    throw errors.internal("Failed to fetch vault pair data")
  }

  const [stableToken, vaultToken] = await Promise.all([
    getTokenFromAddress(v.stableTokenAddress, chainId) ??
      (await fetchErc20Details(v.stableTokenAddress, chainId)),
    getTokenFromAddress(v.vaultTokenAddress, chainId) ??
      (await fetchErc20Details(v.vaultTokenAddress, chainId)),
  ])

  if (!stableToken || !vaultToken) {
    throw errors.internal("Failed to fetch token details for pool currencies")
  }

  const tokenDetails = {
    vaultToken: {
      ...createTokenDetails(v.vaultTokenAddress, vaultToken, b.vaultTokenBalance),
      startingBalance: vaultToken.format(d.startingVaultTokenBalance),
      frozenBalance: vaultToken.format(
        (d.startingVaultTokenBalance * BigInt(v.reserveRatio)) / 10000n,
      ),
      availableBalance: vaultToken.format(
        b.vaultTokenBalance - (d.startingVaultTokenBalance * BigInt(v.reserveRatio)) / 10000n,
      ),
    } satisfies TokenDetails,
    stableToken: {
      ...createTokenDetails(v.stableTokenAddress, stableToken, b.stableTokenBalance),
      startingBalance: stableToken.format(d.startingStableTokenBalance),
      frozenBalance: "0",
      availableBalance: stableToken.format(b.stableTokenBalance),
    } satisfies TokenDetails,
  }

  const tradingEndsAt = d.creationTimestamp + BigInt(v.tradingPeriodDuration)

  const formattedResults = {
    vaultId: Number(v.vaultId),
    vaultAddress: address,
    vaultState: getBondState(vaultStateToString(d.vaultState), tradingEndsAt),
    createdBy: d.issuerAddress,
    createdAt: Number(d.creationTimestamp),
    tradingPeriodDuration: v.tradingPeriodDuration,
    tradingEndsAt: Number(tradingEndsAt),
    bondPrice: v.bondPrice.toString(),
    reserveRatio: v.reserveRatio,
    primaryDex: primaryDexToString(v.primaryDex),
    chainlinkPriceOracleAddress: v.chainlinkPriceOracleAddress,
    wrappedNativeTokenAddress: pairData.approvedPair.wrappedNativeTokenAddress,
    pool: {
      blackhole: blackholeSwapData,
      lfj: lbSwapData,
    },
    ...tokenDetails,
  } satisfies VaultBlockchain

  try {
    return VaultBlockchainSchema.parse(formattedResults)
  } catch (error) {
    console.error("VaultSchema validation error:", error)
    throw errors.internal("Invalid data")
  }
}

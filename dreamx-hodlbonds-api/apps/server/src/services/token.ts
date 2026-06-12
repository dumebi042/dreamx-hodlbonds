import type { ChainId, NativeToken, Token } from "@hodlbonds-api/blockchain"

import {
  clients,
  contractMap,
  fetchErc20Details,
  getTokenFromAddress,
} from "@hodlbonds-api/blockchain"
import { createFactoryInstance } from "@hodlbonds-api/blockchain/contracts/utils"
import { InvalidAddressError, isAddress, zeroAddress, type Address } from "viem"

import type { PoolTokenDetails, ReceiptToken } from "@/types"

import { withBlockchainError } from "@/lib/blockchain-error-handler"
import { errors } from "@/lib/errors"
import { ReceiptTokenSchema } from "@/schemas"
import { primaryDexToString, vaultStateToString } from "@/types"
import { getDexInfo } from "@/utils"

/**
 * Helper to create token detail object from token and balance
 */
function buildTokenDetails(address: Address, token: Token<any> | NativeToken, balance: bigint) {
  return {
    address,
    name: token.name,
    symbol: token.symbol,
    decimals: token.decimals,
    balance: token.format(balance),
  }
}

export async function tokenService({
  chainId,
  factoryAddress,
  id,
}: {
  chainId: ChainId
  factoryAddress: Address
  id: string
}): Promise<ReceiptToken> {
  if (!isAddress(factoryAddress)) {
    const error = new InvalidAddressError({ address: factoryAddress })
    throw errors.badRequest(error.shortMessage)
  }

  const factoryContractFactory = createFactoryInstance({
    name: "DualTokenVaultFactory",
    abi: contractMap.dualTokenVaultFactory.abi,
  })
  const factoryContract = factoryContractFactory.contract(chainId, factoryAddress)
  const vault = await withBlockchainError(
    async () => {
      return await factoryContract.read.getVault([BigInt(id)])
    },
    { chainId, factoryAddress, id },
  )
  const address = vault.vaultCreationData.vaultAddress

  if (address === zeroAddress) {
    throw errors.notFound("Token", id)
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
      ...buildTokenDetails(v.vaultTokenAddress, vaultToken, b.vaultTokenBalance),
      startingBalance: vaultToken.format(d.startingVaultTokenBalance),
      frozenBalance: vaultToken.format(
        (d.startingVaultTokenBalance * BigInt(v.reserveRatio)) / 10000n,
      ),
      availableBalance: vaultToken.format(
        b.vaultTokenBalance - (d.startingVaultTokenBalance * BigInt(v.reserveRatio)) / 10000n,
      ),
    } satisfies PoolTokenDetails,
    stableToken: {
      ...buildTokenDetails(v.stableTokenAddress, stableToken, b.stableTokenBalance),
      startingBalance: stableToken.format(d.startingStableTokenBalance),
      frozenBalance: "0",
      availableBalance: stableToken.format(b.stableTokenBalance),
    } satisfies PoolTokenDetails,
  }

  const formattedResults = {
    id: Number(id),
    name: `Hodl Bonds Receipt Token #${id}`,
    description: `A token that represents a bond in the Hodl Bonds platform. This token entitles the holder to claim rewards based on the performance of the underlying bond.`,
    image: "",
    contractAddress: v.receiptTokenAddress ?? "",
    vaultAddress: address,
    createdBy: d.issuerAddress,
    createdAt: Number(d.creationTimestamp),
    bondState: vaultStateToString(d.vaultState),
    bondPrice: v.bondPrice.toString(),
    tradingPeriodDuration: Number(v.tradingPeriodDuration),
    reserveRatio: v.reserveRatio,
    managementFee: v.managementFee,
    performanceFee: v.performanceFee,
    ...getDexInfo(
      primaryDexToString(v.primaryDex),
      lbSwapData.tokenPairAddress,
      blackholeSwapData.pairAddress,
    ),
    ...tokenDetails,
  } satisfies ReceiptToken

  try {
    return ReceiptTokenSchema.parse(formattedResults)
  } catch (error) {
    console.error("ReceiptTokenSchema validation error:", error)
    throw errors.internal("Invalid data")
  }
}

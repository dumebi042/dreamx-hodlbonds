import type { ChainId, NativeToken, Token } from "@hodlbonds-api/blockchain"

import { faker } from "@faker-js/faker"
import { fetchErc20Details, getTokenFromAddress } from "@hodlbonds-api/blockchain"
import {
  formatEther,
  InvalidAddressError,
  isAddress,
  parseEther,
  zeroAddress,
  type Address,
} from "viem"

import type { PoolTokenDetails, ReceiptToken } from "@/types"

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

export async function tokenMockService({
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

  faker.seed(Number(id))

  const vaultTokenAddress = zeroAddress
  const stableTokenAddress = "0x7ff20782ECEC768D43b96c4232e68582d447A3A7"

  const reserveRatio = faker.number.int({ min: 10, max: 50, multipleOf: 5 })
  const startingValueUSD = faker.number.int({ min: 100, max: 50000, multipleOf: 100 })
  const startingVaultTokenBalance = parseEther(String(startingValueUSD / 15))
  const startingStableTokenBalance = parseEther(String((startingValueUSD * reserveRatio) / 100))

  const vaultTokenBalance = parseEther(
    faker.number
      .float({
        min: Number(formatEther(startingVaultTokenBalance)) * 0.9,
        max: Number(formatEther(startingVaultTokenBalance)) * 1.5,
        fractionDigits: 18,
      })
      .toString(),
  )
  const stableTokenBalance = parseEther(
    faker.number
      .float({
        min: Number(formatEther(startingStableTokenBalance)) * 0.9,
        max: Number(formatEther(startingStableTokenBalance)) * 1.5,
        fractionDigits: 18,
      })
      .toString(),
  )

  const [stableToken, vaultToken] = await Promise.all([
    getTokenFromAddress(stableTokenAddress, chainId) ??
      (await fetchErc20Details(stableTokenAddress, chainId)),
    getTokenFromAddress(vaultTokenAddress, chainId) ??
      (await fetchErc20Details(vaultTokenAddress, chainId)),
  ])

  if (!stableToken || !vaultToken) {
    throw errors.internal("Failed to fetch token details for pool currencies")
  }

  const tokenDetails = {
    vaultToken: {
      ...buildTokenDetails(vaultTokenAddress, vaultToken, vaultTokenBalance),
      startingBalance: vaultToken.format(startingVaultTokenBalance),
      frozenBalance: vaultToken.format((startingVaultTokenBalance * BigInt(reserveRatio)) / 10000n),
      availableBalance: vaultToken.format(
        vaultTokenBalance - (startingVaultTokenBalance * BigInt(reserveRatio)) / 10000n,
      ),
    } satisfies PoolTokenDetails,
    stableToken: {
      ...buildTokenDetails(stableTokenAddress, stableToken, stableTokenBalance),
      startingBalance: stableToken.format(startingStableTokenBalance),
      frozenBalance: "0",
      availableBalance: stableToken.format(stableTokenBalance),
    } satisfies PoolTokenDetails,
  }

  const formattedResults = {
    id: Number(id),
    name: `Hodl Bonds Receipt Token #${id}`,
    description: `A token that represents a bond in the Hodl Bonds platform. This token entitles the holder to claim rewards based on the performance of the underlying bond.`,
    image: "",
    contractAddress: faker.finance.ethereumAddress() as Address,
    vaultAddress: faker.finance.ethereumAddress() as Address,
    createdBy: faker.finance.ethereumAddress() as Address,
    createdAt: Math.floor(faker.date.recent({ days: 30 }).getTime() / 1000),
    bondState: vaultStateToString(1),
    bondPrice: startingVaultTokenBalance.toString(),
    tradingPeriodDuration: faker.number.int({ min: 7776000, max: 31536000, multipleOf: 86400 }), // between 3 months and 1 year
    reserveRatio,
    managementFee: 200,
    performanceFee: 2000,
    ...getDexInfo(
      primaryDexToString(faker.number.int({ min: 0, max: 1 })),
      "0xaBD184A218989683fE980BF90CE2ddDc48Aac00C",
      "0x41100C6D2c6920B10d12Cd8D59c8A9AA2eF56fC7",
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

import type { ChainId } from "@hodlbonds-api/blockchain"

import { createERC20, getTokenFromAddress } from "@hodlbonds-api/blockchain"
import { getDb } from "@hodlbonds-api/db"
import { bonds, tradeRequests } from "@hodlbonds-api/db/schema"
import { and, eq } from "drizzle-orm"
import { isAddress, parseUnits, type Address } from "viem"

import type { CreateOrderBody, CreateOrderResponse } from "@/schemas"

import { errors } from "@/lib/errors"
import { getTokenOrThrow } from "@/lib/token-cache"

import type { DexAdapter, DexSelection, PoolToken, SwapContext } from "./dex/types"

import { getDexAdapter, getDexSelections, type DexSelectionsInput } from "./dex"
import { validateQuoteAgainstOracle } from "./dex/oracle"
import { vaultService } from "./vault"

/**
 * Data needed to execute an order, from either DB or blockchain
 */
interface OrderVaultData {
  vaultToken: PoolToken
  stableToken: PoolToken
  dexInput: DexSelectionsInput
  chainlinkPriceOracleAddress?: Address
  wrappedNativeTokenAddress?: Address
}

/**
 * Fetches order data from the database.
 * Returns null if not found, allowing fallback to blockchain.
 */
async function getOrderDataFromDb(
  chainId: ChainId,
  vaultAddress: string,
): Promise<OrderVaultData | null> {
  const db = getDb()

  const bond = await db.query.bonds.findFirst({
    where: and(
      eq(bonds.chainId, chainId),
      eq(bonds.vaultAddress, vaultAddress),
      eq(bonds.isComplete, true),
    ),
    with: {
      pair: true,
    },
  })

  if (!bond || !bond.pair) {
    return null
  }

  // Build token objects from cache
  const vaultTokenInfo = getTokenOrThrow(chainId, bond.vaultTokenAddress as Address)
  const stableTokenInfo = getTokenOrThrow(chainId, bond.stableTokenAddress as Address)

  return {
    vaultToken: createERC20({
      ...vaultTokenInfo,
      addresses: { [chainId]: vaultTokenInfo.address as Address },
      balance: bond.vaultTokenBalance ?? undefined,
    }),
    stableToken: createERC20({
      ...stableTokenInfo,
      addresses: { [chainId]: stableTokenInfo.address as Address },
      balance: bond.stableTokenBalance ?? undefined,
    }),
    dexInput: {
      primaryDex: bond.primaryDex === 1 ? "BLACKHOLE" : "LFJ",
      pool: {
        lfj: bond.pair.routerAddress
          ? {
              tokenPairAddress: bond.pair.tokenPairAddress as Address,
              routerAddress: bond.pair.routerAddress as Address,
              version: bond.pair.version ?? 0,
            }
          : undefined,
        blackhole: bond.pair.routerV2Address
          ? {
              pairAddress: bond.pair.pairAddress as Address,
              routerV2Address: bond.pair.routerV2Address as Address,
              concentrated: bond.pair.concentrated ?? false,
            }
          : undefined,
      },
    },
    chainlinkPriceOracleAddress: bond.pair.chainlinkPriceOracleAddress as Address | undefined,
    wrappedNativeTokenAddress: bond.pair.wrappedNativeTokenAddress as Address | undefined,
  }
}

/**
 * Attempts to get quote, validate it against oracle, and simulate the swap for a given DEX.
 * Returns the adapter and quote result on success, or throws on failure.
 */
async function tryDex(
  selection: DexSelection,
  context: SwapContext,
  deadline: bigint,
  clientOrderId: string,
): Promise<{ adapter: DexAdapter; expectedOutput: bigint; minAmountOut: bigint }> {
  const adapter = getDexAdapter(
    selection.type,
    selection.config,
    {
      clientOrderId,
      vaultAddress: context.vaultAddress,
      side: context.side,
      size: context.size,
      chainId: context.chainId,
    },
    context.vaultToken,
    context.stableToken,
    context.wrappedNativeTokenAddress,
  )

  // Get quote
  const { expectedOutput, minAmountOut } = await adapter.getQuote()

  // Validate quote - expectedOutput must be positive
  if (expectedOutput <= 0n) {
    throw errors.badRequest(`${selection.type}: Quote returned zero or negative output`)
  }

  // Validate quote against Chainlink oracle (if oracle is configured)
  if (context.chainlinkPriceOracleAddress && isAddress(context.chainlinkPriceOracleAddress)) {
    const inputAmount = adapter.inputToken.parse(context.size)

    // For sells: input is vault token, output is stable token
    // For buys: input is stable token, output is vault token
    const vaultTokenAmount = context.side === "sell" ? inputAmount : expectedOutput
    const stableTokenAmount = context.side === "sell" ? expectedOutput : inputAmount

    await validateQuoteAgainstOracle({
      chainId: context.chainId,
      oracleAddress: context.chainlinkPriceOracleAddress,
      vaultTokenAmount,
      stableTokenAmount,
      vaultTokenDecimals: context.vaultToken.decimals,
      stableTokenDecimals: context.stableToken.decimals,
    })
  }

  // Simulate swap on vault contract
  await adapter.simulateSwap({ minAmountOut, deadline })

  return { adapter, expectedOutput, minAmountOut }
}

/**
 * Creates and executes a trading order with primary/backup DEX fallback.
 *
 * Flow:
 * 1. Reserve order in database (INSERT with status "created")
 * 2. Validate vault/token data, check balance, get DEX quote, simulate swap
 * 3. Publish to executor via PubSub, update status to "submitted"
 *
 * Step 2 failures set status to "rejected" with a failureReason and re-throw.
 * Step 3 failures leave status as "created" — the executor may still process the
 * message if PubSub accepted it before the ack timed out.
 *
 * @param chainId - Blockchain chain ID
 * @param body - Order creation parameters
 * @returns Order confirmation with clientOrderId
 */
export async function orderService(
  chainId: ChainId,
  { clientOrderId, vaultAddress, side, size }: CreateOrderBody,
): Promise<CreateOrderResponse> {
  console.log(
    `Received order on chain ${chainId}: ${clientOrderId} ${vaultAddress} ${side} ${size}`,
  )

  const db = getDb()

  // Reserve the order
  const [result] = await db
    .insert(tradeRequests)
    .values({
      clientOrderId,
      chainId,
      vaultAddress,
      side,
      size,
    })
    .onConflictDoNothing({ target: tradeRequests.clientOrderId })
    .returning({ id: tradeRequests.id })

  if (!result) {
    throw errors.conflict(`Order with clientOrderId '${clientOrderId}' already exists`)
  }

  const reservationId = result.id

  // Validate and prepare the order for publishing
  let adapter: DexAdapter
  let minAmountOut: bigint
  let deadlineSeconds: number

  try {
    // Try database first, fall back to blockchain
    const dbResult = await getOrderDataFromDb(chainId, vaultAddress)

    let orderData: OrderVaultData

    if (dbResult) {
      orderData = dbResult
    } else {
      // Fallback to blockchain lookup
      console.warn(
        `Bond not found in database for ${chainId}:${vaultAddress}, falling back to blockchain`,
      )

      const vaultData = await vaultService({ chainId, address: vaultAddress })
      if (!vaultData || !vaultData.pool) {
        throw errors.internal("Failed to fetch vault pool data")
      }

      // Fetch token objects for vault and stable tokens
      const [vaultToken, stableToken] = await Promise.all([
        getTokenFromAddress(vaultData.vaultToken.address, chainId, {
          balance: parseUnits(vaultData.vaultToken.balance, vaultData.vaultToken.decimals),
        }),
        getTokenFromAddress(vaultData.stableToken.address, chainId, {
          balance: parseUnits(vaultData.stableToken.balance, vaultData.stableToken.decimals),
        }),
      ])

      if (!vaultToken || !stableToken) {
        throw errors.internal("Failed to fetch token details for vault/stable tokens")
      }

      orderData = {
        vaultToken,
        stableToken,
        dexInput: vaultData,
        chainlinkPriceOracleAddress: vaultData.chainlinkPriceOracleAddress,
        wrappedNativeTokenAddress: vaultData.wrappedNativeTokenAddress,
      }
    }

    // Get primary and backup DEX selections
    const { primary, backup } = getDexSelections(orderData.dexInput)

    // Prepare swap context
    const swapContext: SwapContext = {
      chainId,
      vaultAddress,
      side,
      size,
      vaultToken: orderData.vaultToken,
      stableToken: orderData.stableToken,
      chainlinkPriceOracleAddress: orderData.chainlinkPriceOracleAddress,
      wrappedNativeTokenAddress: orderData.wrappedNativeTokenAddress,
    }

    // Validate vault has sufficient balance for the swap
    const inputToken = side === "buy" ? orderData.stableToken : orderData.vaultToken
    const outputToken = side === "buy" ? orderData.vaultToken : orderData.stableToken
    const requiredAmount = inputToken.parse(size)
    const availableBalance = inputToken.balance
    if (!availableBalance || availableBalance < requiredAmount) {
      throw errors.unprocessableEntity(
        `Insufficient ${inputToken.name} balance. Required: ${size}, Available: ${inputToken.format(availableBalance ?? 0n)}`,
      )
    }

    console.log("Swap details:", {
      side,
      vaultToken: orderData.vaultToken.address(chainId),
      stableToken: orderData.stableToken.address(chainId),
      interpretation: `Swapping ${size} ${inputToken.name} → ${outputToken.name}`,
    })

    deadlineSeconds = Math.ceil(Date.now() / 1000) + 300 // 5 minutes from now
    const deadline = BigInt(deadlineSeconds)

    // Try primary DEX
    let primaryError: Error | null = null

    try {
      const dexResult = await tryDex(primary, swapContext, deadline, clientOrderId)
      adapter = dexResult.adapter
      minAmountOut = dexResult.minAmountOut
    } catch (error) {
      primaryError = error instanceof Error ? error : new Error(String(error))

      // Try backup DEX if available
      if (!backup) {
        throw errors.unprocessableEntity(
          `Primary DEX (${primary.type}) failed and no backup DEX available. Error: ${primaryError.message}`,
        )
      }

      try {
        const dexResult = await tryDex(backup, swapContext, deadline, clientOrderId)
        adapter = dexResult.adapter
        minAmountOut = dexResult.minAmountOut
      } catch (backupError) {
        const backupErrorMsg =
          backupError instanceof Error ? backupError.message : String(backupError)
        throw errors.unprocessableEntity(
          `Both DEXes failed. Primary (${primary.type}): ${primaryError.message}. Backup (${backup.type}): ${backupErrorMsg}`,
        )
      }
    }
  } catch (error) {
    const failureReason = error instanceof Error ? error.message : String(error)
    await db
      .update(tradeRequests)
      .set({ status: "rejected", failureReason })
      .where(eq(tradeRequests.id, reservationId))
    throw error
  }

  // Publish to the executor
  try {
    const deadline = BigInt(deadlineSeconds)
    const messageId = await adapter.executeSwap({ deadline, minAmountOut })
    console.log({ messageId, clientOrderId })

    const expiresAt = new Date(deadlineSeconds * 1000)
    await db
      .update(tradeRequests)
      .set({ status: "submitted", messageId, expiresAt })
      .where(eq(tradeRequests.id, reservationId))
  } catch (error) {
    console.error("Publish failed after order validation", { clientOrderId, error })
    throw error
  }
  return { clientOrderId }
}

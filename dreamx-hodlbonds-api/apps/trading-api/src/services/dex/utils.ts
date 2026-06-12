import type { ChainId } from "@hodlbonds-api/blockchain"
import type { Address } from "viem"

import { Network } from "@dreamx-development/hodlbonds-blockchain-executor-dto"
import { env } from "@hodlbonds-api/env/trading-api"
import { SimpleMerkleTree } from "@openzeppelin/merkle-tree"
import { keccak256 } from "viem"

import { errors } from "@/lib/errors"

const BPS_DENOMINATOR = 10000n
const SLIPPAGE_TOLERANCE_BPS = 25n // 0.25% slippage tolerance (25 basis points)
export const MAX_ORACLE_DEVIATION_BPS = 300n // 3% maximum deviation from oracle price
export const MAX_ORACLE_STALENESS_SECONDS = 3600 // 1 hour stale price tolerance

/**
 * Calculate minimum acceptable output amount with slippage protection
 * @param quoteAmount - Expected output amount from quote
 * @param slippageBps - Slippage tolerance in basis points (default: 25 bps = 0.25%)
 * @returns Minimum acceptable output amount
 */
export function calculateMinAmountOut(
  quoteAmount: bigint,
  slippageBps: bigint = SLIPPAGE_TOLERANCE_BPS,
): bigint {
  return (quoteAmount * (BPS_DENOMINATOR - slippageBps)) / BPS_DENOMINATOR
}

/**
 * Calculate deviation between quote output and oracle-derived fair price
 * @returns deviation in basis points (can be negative if quote is below oracle price)
 */
export function calculateDeviationBps(quoteAmount: bigint, oracleFairAmount: bigint): bigint {
  if (oracleFairAmount === 0n) return 0n
  // (quoteAmount - oracleFairAmount) / oracleFairAmount * 10000
  return ((quoteAmount - oracleFairAmount) * BPS_DENOMINATOR) / oracleFairAmount
}

export function getExecutorClientNetwork(chainId: ChainId): Network {
  switch (chainId) {
    case 43114:
      return Network.ava
    case 43113:
      return Network.ava
    case 11155111:
      return Network.eth
  }
}

/**
 * Generates a Merkle proof for an executor address to verify trader role.
 * Uses keccak256(address) for leaf hashing to match on-chain implementation.
 * @param executorAddress - The executor address to generate proof for
 * @returns Merkle proof as array of bytes32 hashes
 */
export function generateExecutorMerkleProof(executorAddress: Address): readonly Address[] {
  const addresses = env.EXECUTOR_ADDRESSES
  const index = addresses.findIndex((addr) => addr.toLowerCase() === executorAddress.toLowerCase())
  if (index === -1) {
    throw errors.internal(
      `Executor address ${executorAddress} not found in configured executor addresses`,
    )
  }

  const leaves = addresses.map((addr) => keccak256(addr))
  const tree = SimpleMerkleTree.of(leaves)
  return tree.getProof(keccak256(executorAddress)) as readonly Address[]
}

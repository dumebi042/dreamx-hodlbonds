import { parseAbi } from "viem"

/**
 * ABI for Blackhole Basic Pair contracts (forked from Thena/Solidly)
 * Used for quoting swaps on non-concentrated (basic) pools
 */
export const blackholePairAbi = parseAbi([
  "function token0() external view returns (address)",
  "function token1() external view returns (address)",
  "function getAmountOut(uint256 amountIn, address tokenIn) external view returns (uint256)",
  "function stable() external view returns (bool)",
  "function getReserves() external view returns (uint256 reserve0, uint256 reserve1, uint256 blockTimestampLast)",
])

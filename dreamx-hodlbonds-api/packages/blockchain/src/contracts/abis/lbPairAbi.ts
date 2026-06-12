import { parseAbi } from "viem"

export const lbPairAbi = parseAbi([
  // Token info
  "function getTokenX() external view returns (address tokenX)",
  "function getTokenY() external view returns (address tokenY)",

  // Swap simulation
  "function getSwapOut(uint128 amountIn, bool swapForY) external view returns (uint128 amountInLeft, uint128 amountOut, uint128 fee)",
  "function getSwapIn(uint128 amountOut, bool swapForY) external view returns (uint128 amountIn, uint128 amountOutLeft, uint128 fee)",

  // Pool state
  "function getActiveId() external view returns (uint24 activeId)",
  "function getBinStep() external view returns (uint16 binStep)",
  "function getReserves() external view returns (uint128 reserveX, uint128 reserveY)",
])

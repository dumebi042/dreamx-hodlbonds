import { parseAbi } from "viem"

/**
 * Chainlink Price Feed ABI
 * Used to fetch oracle prices for quote validation
 *
 * latestRoundData returns:
 * - roundId: The round ID
 * - answer: The price (8 decimals for USD feeds)
 * - startedAt: Timestamp when the round started
 * - updatedAt: Timestamp when the round was last updated
 * - answeredInRound: The round ID in which the answer was computed
 */
export const chainlinkPriceFeedAbi = parseAbi([
  "function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  "function decimals() external view returns (uint8)",
  "function description() external view returns (string)",
])

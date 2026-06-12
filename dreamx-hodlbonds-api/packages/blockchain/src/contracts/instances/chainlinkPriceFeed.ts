import { chainlinkPriceFeedAbi } from "../abis/chainlinkPriceFeedAbi"
import { createFactoryInstance } from "../utils"

/**
 * Factory instance for Chainlink Price Feed contracts
 * Address varies per oracle (e.g., AVAX/USD, WBTC/USD)
 */
export const chainlinkPriceFeed = createFactoryInstance({
  name: "ChainlinkPriceFeed",
  abi: chainlinkPriceFeedAbi,
})

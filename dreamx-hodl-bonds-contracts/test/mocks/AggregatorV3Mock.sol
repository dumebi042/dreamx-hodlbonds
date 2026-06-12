// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

contract AggregatorV3Mock {
    uint256 updatedAtTimestamp;

    constructor(uint256 _updatedAt) {
        updatedAtTimestamp = _updatedAt;
    }

    function setUpdatedAt(uint256 _updatedAt) external {
        updatedAtTimestamp = _updatedAt;
    }

    function decimals() external pure returns (uint8) {
        return 8;
    }

    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        return (55340232221128776381, 1_000_000_000, updatedAtTimestamp, updatedAtTimestamp, 55340232221128776381);
    }
}

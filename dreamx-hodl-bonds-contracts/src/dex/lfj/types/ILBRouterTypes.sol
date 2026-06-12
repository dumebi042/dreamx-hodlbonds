// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

enum Version {
    V1,
    V2,
    V2_1,
    V2_2
}

struct Path {
    uint256[] pairBinSteps;
    Version[] versions;
    IERC20[] tokenPath;
}

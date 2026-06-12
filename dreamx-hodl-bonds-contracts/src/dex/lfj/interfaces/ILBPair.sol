// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ILBPair {
    function getBinStep() external pure returns (uint16);
    function getTokenX() external pure returns (IERC20 tokenX);
    function getTokenY() external pure returns (IERC20 tokenY);
}

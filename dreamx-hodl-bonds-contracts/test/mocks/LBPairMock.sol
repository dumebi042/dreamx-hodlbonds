// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract LBPairMock {
    IERC20 public x;
    IERC20 public y;

    constructor(address _tokenX, address _tokenY) {
        x = IERC20(_tokenX);
        y = IERC20(_tokenY);
    }

    function getBinStep() external pure returns (uint16) {
        return 0;
    }

    function getTokenX() external view returns (IERC20 tokenX) {
        return x;
    }

    function getTokenY() external view returns (IERC20 tokenY) {
        return y;
    }
}

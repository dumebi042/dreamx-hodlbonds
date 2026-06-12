// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IWNATIVE} from "src/dex/interfaces/IWNATIVE.sol";
import {Path} from "src/dex/lfj/types/ILBRouterTypes.sol";

contract LBRouterMock {
    IWNATIVE wrappedNativeToken;

    constructor(address _wrappedNativeToken) {
        wrappedNativeToken = IWNATIVE(_wrappedNativeToken);
    }

    function getWNATIVE() external view returns (IWNATIVE wnative) {
        return wrappedNativeToken;
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256,
        Path memory path,
        address to,
        uint256
    ) external returns (uint256 amountOut) {
        IERC20 fromToken = IERC20(path.tokenPath[0]);
        IERC20 toToken = IERC20(path.tokenPath[1]);

        // For simplicity, assume a 1:1 swap rate
        require(fromToken.transferFrom(msg.sender, address(this), amountIn), "Transfer failed");
        require(toToken.transfer(to, amountIn), "Transfer failed");

        return amountIn;
    }

    function swapExactTokensForNATIVE(
        uint256 amountIn,
        uint256,
        Path memory path,
        address payable to,
        uint256
    ) external returns (uint256 amountOut) {
        IERC20 fromToken = IERC20(path.tokenPath[0]);

        // For simplicity, assume a 1:1 swap rate
        require(fromToken.transferFrom(msg.sender, address(this), amountIn), "Transfer failed");
        to.transfer(amountIn);

        return amountIn;
    }

    function swapExactNATIVEForTokens(
        uint256,
        Path memory path,
        address to,
        uint256
    ) external payable returns (uint256 amountOut) {
        IERC20 toToken = IERC20(path.tokenPath[1]);

        // For simplicity, assume a 1:1 swap rate
        require(toToken.transfer(to, msg.value), "Transfer failed");

        return msg.value;
    }
}

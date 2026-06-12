// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.30;

import {ILBPair} from "src/dex/lfj/interfaces/ILBPair.sol";
import {Path} from "src/dex/lfj/types/ILBRouterTypes.sol";
import {IWNATIVE} from "src/dex/interfaces/IWNATIVE.sol";

interface ILBRouter {
    // -----------------------------------------------------------------------
    // GETTERS
    // -----------------------------------------------------------------------

    function getWNATIVE() external view returns (IWNATIVE wnative);

    // -----------------------------------------------------------------------
    // PRICE / ID HELPERS
    // -----------------------------------------------------------------------

    function getIdFromPrice(ILBPair pair, uint256 price) external view returns (uint24);

    function getPriceFromId(ILBPair pair, uint24 id) external view returns (uint256);

    function getSwapIn(
        ILBPair pair,
        uint128 amountOut,
        bool swapForY
    ) external view returns (uint128 amountIn, uint128 amountOutLeft, uint128 fee);

    function getSwapOut(
        ILBPair pair,
        uint128 amountIn,
        bool swapForY
    ) external view returns (uint128 amountInLeft, uint128 amountOut, uint128 fee);

    // -----------------------------------------------------------------------
    // SWAPS
    // -----------------------------------------------------------------------

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        Path memory path,
        address to,
        uint256 deadline
    ) external returns (uint256 amountOut);

    function swapExactTokensForNATIVE(
        uint256 amountIn,
        uint256 amountOutMinNATIVE,
        Path memory path,
        address payable to,
        uint256 deadline
    ) external returns (uint256 amountOut);

    function swapExactNATIVEForTokens(
        uint256 amountOutMin,
        Path memory path,
        address to,
        uint256 deadline
    ) external payable returns (uint256 amountOut);

    function swapTokensForExactTokens(
        uint256 amountOut,
        uint256 amountInMax,
        Path memory path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amountsIn);

    function swapTokensForExactNATIVE(
        uint256 amountNATIVEOut,
        uint256 amountInMax,
        Path memory path,
        address payable to,
        uint256 deadline
    ) external returns (uint256[] memory amountsIn);

    function swapNATIVEForExactTokens(
        uint256 amountOut,
        Path memory path,
        address to,
        uint256 deadline
    ) external payable returns (uint256[] memory amountsIn);
}

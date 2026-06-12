// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.30;

import {Route} from "src/dex/blackhole/types/BlackholeSwapTypes.sol";

interface IRouterV2 {
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        Route[] calldata routes,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);

    function swapExactETHForTokens(
        uint amountOutMin,
        Route[] calldata routes,
        address to,
        uint deadline
    ) external payable returns (uint[] memory amounts);

    function swapExactTokensForETH(
        uint amountIn,
        uint amountOutMin,
        Route[] calldata routes,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);
    function wETH() external view returns (address);
}

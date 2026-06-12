// SPDX-License-Identifier: MIT

pragma solidity 0.8.30;

interface ISwapBaseEvents {
    event TradeCompleted(
        address indexed vaultAddress,
        address indexed routerAddress,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 tokenInBalanceAfterSwap, // the amount of tokenIn held by the vault after the swap
        uint256 tokenOutBalanceAfterSwap // the amount of tokenOut held by the vault after the swap
    );

    error InvalidTokenAddress();
    error InvalidRouterAddress();
    error InvalidPairAddress();
    error InsufficientOutputAmount(uint256 expected, uint256 actual);
    error InvalidBinStepsLength();
    error InvalidVersionsLength();
    error InvalidTokenPathLength();
    error InvalidRouteLength();
    error RoutesNotContinuous();
}

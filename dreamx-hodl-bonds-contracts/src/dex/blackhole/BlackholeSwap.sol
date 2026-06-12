// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SwapBase} from "src/dex/SwapBase.sol";
import {IRouterV2} from "src/dex/blackhole/interfaces/IRouterV2.sol";
import {BlackholeSwapParameters} from "src/dex/blackhole/types/BlackholeSwapTypes.sol";
import {Route} from "src/dex/blackhole/types/BlackholeSwapTypes.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title BlackholeSwap
 * @author Drew Kerby
 * @notice Abstract contract providing swap functionality through the Blackhole DEX protocol
 * @dev This contract handles token swaps using Blackhole's router V2, supporting both ERC20 tokens and native tokens.
 *      It manages token approvals, route configuration, and handles wrapped native token conversions.
 */
abstract contract BlackholeSwap is SwapBase {
    using SafeERC20 for IERC20;

    BlackholeSwapParameters blackholeSwapData;

    /**
     * @notice Returns the Blackhole swap configuration data
     * @return The Blackhole swap parameters
     */
    function getBlackholeSwapData() external view returns (BlackholeSwapParameters memory) {
        return blackholeSwapData;
    }

    /**
     * @notice Initializes Blackhole swap configuration
     * @param _blackholeSwapData The Blackhole swap parameters
     * @param _wrappedNativeTokenAddress Address of wrapped native token
     */
    function _initializeBlackholeSwap(
        BlackholeSwapParameters memory _blackholeSwapData,
        address _wrappedNativeTokenAddress
    ) internal {
        // check that the router address is not the zero address
        if (_blackholeSwapData.routerV2Address == address(0)) {
            revert InvalidRouterAddress();
        }

        // check that the routes array is not empty
        if (_blackholeSwapData.routes.length == 0) {
            revert InvalidRouteLength();
        }

        // check that the first route's from token and the last route's to token are either token0 or token1
        address firstRouteFrom = _blackholeSwapData.routes[0].from;
        address lastRouteTo = _blackholeSwapData.routes[_blackholeSwapData.routes.length - 1].to;
        if (
            (firstRouteFrom != token0 || lastRouteTo != token1) && (firstRouteFrom != token1 || lastRouteTo != token0)
        ) {
            revert InvalidTokenAddress();
        }

        uint256 len = _blackholeSwapData.routes.length;

        for (uint256 i = 0; i < len; i++) {
            // check pair is not zero
            if (_blackholeSwapData.routes[i].pair == address(0)) {
                revert InvalidPairAddress();
            }

            // check continuity (skip last element)
            if (i < len - 1) {
                if (_blackholeSwapData.routes[i].to != _blackholeSwapData.routes[i + 1].from) {
                    revert RoutesNotContinuous();
                }

                // set the reciever to the router address for all but the last route
                _blackholeSwapData.routes[i].receiver = _blackholeSwapData.routerV2Address;
            }
        }

        // Need to check that the pair has the correct tokens,
        // as well as check that the wrapped native token is one of the tokens in the pair, if set
        if (_wrappedNativeTokenAddress != address(0)) {
            _checkTokenAddress(_wrappedNativeTokenAddress);
        }

        // store the swap data
        blackholeSwapData = _blackholeSwapData;
    }

    /**
     * @notice Executes a swap using Blackhole DEX with exact input amount
     * @dev Handles native token wrapping/unwrapping as needed. Validates output amount.
     * @param _amountIn The exact amount of input tokens
     * @param _minAmountOut The minimum amount of output tokens expected
     * @param _tokenIn The input token address (zero address for native token)
     * @param _deadline The deadline timestamp for the swap
     */
    function _blackholeSwapExactInputSingle(
        uint128 _amountIn,
        uint128 _minAmountOut,
        address _tokenIn,
        uint256 _deadline
    ) internal {
        // use the wrapped native token address if tokenIn is address(0)
        if (_tokenIn == address(0)) {
            _tokenIn = wrappedNativeTokenAddress;
        }

        // approve the router to spend the input token
        IERC20(_tokenIn).forceApprove(blackholeSwapData.routerV2Address, _amountIn);

        BlackholeSwapParameters memory data = blackholeSwapData;

        IRouterV2 router = IRouterV2(data.routerV2Address);
        _checkTokenAddress(_tokenIn);

        bool tokenInIsNative = _isWrappedNativeToken(_tokenIn);
        bool tokenOutIsNative = tokenInIsNative ? false : _isWrappedNativeToken(token0 == _tokenIn ? token1 : token0);

        uint256[] memory amountsOutReal;
        Route[] memory route;

        // check and reverse the route if neccessary
        if (data.routes[0].from == _tokenIn) {
            route = data.routes;
        } else {
            route = _buildReverseRoute(data.routes);
        }

        if (tokenInIsNative) {
            // set the final receiver to the address of the vault
            route[route.length - 1].receiver = address(this);
            amountsOutReal = router.swapExactETHForTokens{value: _amountIn}(
                _minAmountOut,
                route,
                address(this),
                _deadline
            );
        } else if (tokenOutIsNative) {
            // set the final receiver to the address of the router, so it gets unwrapped and sent to the vault in the same transaction
            route[route.length - 1].receiver = address(router);
            amountsOutReal = router.swapExactTokensForETH(_amountIn, _minAmountOut, route, address(this), _deadline);
        } else {
            // set the final receiver to the address of the vault
            route[route.length - 1].receiver = address(this);

            amountsOutReal = router.swapExactTokensForTokens(_amountIn, _minAmountOut, route, address(this), _deadline);
        }

        // the final amount out is the last element in the amountsOutReal array
        uint256 amountOutReal = amountsOutReal[amountsOutReal.length - 1];

        address tokenIn = tokenInIsNative ? address(0) : _tokenIn;
        address tokenOut = token0 == _tokenIn ? token1 : token0;
        tokenOut = tokenOutIsNative ? address(0) : tokenOut;

        emit TradeCompleted(
            address(this),
            data.routerV2Address,
            tokenIn,
            tokenOut,
            _amountIn,
            amountOutReal,
            _getTokenBalance(tokenIn),
            _getTokenBalance(tokenOut)
        );

        // set the router approval back to 0 for security reasons
        IERC20(_tokenIn).forceApprove(blackholeSwapData.routerV2Address, 0);
    }

    function _buildReverseRoute(Route[] memory _route) internal view returns (Route[] memory) {
        uint256 len = _route.length;
        Route[] memory rev = new Route[](len);
        address routerAddress = blackholeSwapData.routerV2Address;

        for (uint256 i = 0; i < len; ++i) {
            Route memory r = _route[len - 1 - i];

            // Determine receiver
            address receiver = (i < len - 1)
                ? routerAddress // next pair in reversed path
                : address(this);

            rev[i] = Route({
                pair: r.pair,
                from: r.to,
                to: r.from,
                stable: r.stable,
                concentrated: r.concentrated,
                receiver: receiver
            });
        }

        return rev;
    }
}

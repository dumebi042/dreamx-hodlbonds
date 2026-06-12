// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ILBRouter} from "src/dex/lfj/interfaces/ILBRouter.sol";
import {LiquidityBookSwapParameters} from "src/dex/lfj/types/LiquidityBookSwapTypes.sol";
import {SwapBase} from "src/dex/SwapBase.sol";
import {Path} from "src/dex/lfj/types/LiquidityBookSwapTypes.sol";
import {Version} from "src/dex/lfj/types/ILBRouterTypes.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title LiquidityBookSwap
 * @author Drew Kerby
 * @notice Abstract contract providing swap functionality through Trader Joe's Liquidity Book protocol
 * @dev This contract handles token swaps using Trader Joe's LB Router, supporting both ERC20 tokens and native tokens.
 *      It manages token pair configuration, bin steps, and handles wrapped native token conversions.
 */
abstract contract LiquidityBookSwap is SwapBase {
    using SafeERC20 for IERC20;

    LiquidityBookSwapParameters lbSwapData;

    /**
     * @notice Returns the Liquidity Book swap configuration data
     * @return The Liquidity Book swap parameters
     */
    function getLBSwapData() external view returns (LiquidityBookSwapParameters memory) {
        return lbSwapData;
    }

    /**
     * @notice Initializes Liquidity Book swap configuration
     * @param _lbSwapData The Liquidity Book swap parameters
     * @param _wrappedNativeTokenAddress Address of wrapped native token
     */
    function _initializeLiquidityBookSwap(
        LiquidityBookSwapParameters memory _lbSwapData,
        address _wrappedNativeTokenAddress
    ) internal {
        if (_lbSwapData.path.pairBinSteps.length == 0) {
            revert InvalidBinStepsLength();
        }

        if (_lbSwapData.path.versions.length != _lbSwapData.path.pairBinSteps.length) {
            revert InvalidVersionsLength();
        }

        if (_lbSwapData.path.tokenPath.length != _lbSwapData.path.pairBinSteps.length + 1) {
            revert InvalidTokenPathLength();
        }

        if (_lbSwapData.routerAddress == address(0)) {
            revert InvalidRouterAddress();
        }

        // make sure none of the pair addresses are the zero address
        for (uint256 i = 0; i < _lbSwapData.path.tokenPath.length; i++) {
            if (_lbSwapData.path.tokenPath[i] == IERC20(address(0))) {
                revert InvalidTokenAddress();
            }
        }

        // set the tokens for each side of the swap
        _setTokens(
            address(_lbSwapData.path.tokenPath[0]),
            address(_lbSwapData.path.tokenPath[_lbSwapData.path.tokenPath.length - 1])
        );
        _setWrappedNativeTokenAddress(_wrappedNativeTokenAddress);

        // ensure that the wrapped native token is one of the tokens in the pair if this isn't an ERC20 vault
        if (_wrappedNativeTokenAddress != address(0)) {
            _checkTokenAddress(_wrappedNativeTokenAddress);
        }

        // store the swap data
        lbSwapData = _lbSwapData;
    }

    /**
     * @notice Executes a swap using Liquidity Book DEX with exact input amount
     * @dev Handles native token wrapping/unwrapping as needed. Validates output amount.
     * @param _amountIn The exact amount of input tokens
     * @param _minAmountOut The minimum amount of output tokens expected
     * @param _tokenIn The input token address (zero address for native token)
     * @param _deadline The deadline timestamp for the swap
     */
    function _lbSwapExactInputSingle(
        uint128 _amountIn,
        uint128 _minAmountOut,
        address _tokenIn,
        uint256 _deadline
    ) internal {
        if (_tokenIn == address(0)) {
            // use the wrapped native token address if tokenIn is address(0)
            _tokenIn = wrappedNativeTokenAddress;
        }

        // approve the router to spend the input token
        IERC20(_tokenIn).forceApprove(lbSwapData.routerAddress, _amountIn);

        LiquidityBookSwapParameters memory data = lbSwapData;

        ILBRouter router = ILBRouter(data.routerAddress); // Trader Joe LB Router address

        // make sure the tokenIn is either token0 or token1
        _checkTokenAddress(_tokenIn);

        uint256 amountOutReal;
        address tokenInAddress = address(data.path.tokenPath[0]);
        address tokenOutAddress;
        Path memory path;

        if (tokenInAddress == _tokenIn) {
            tokenOutAddress = address(data.path.tokenPath[data.path.tokenPath.length - 1]);
            path = data.path;
        } else {
            tokenInAddress = address(data.path.tokenPath[data.path.tokenPath.length - 1]);
            tokenOutAddress = address(data.path.tokenPath[0]);
            path = _buildReversePath(data.path);
        }

        if (_isWrappedNativeToken(_tokenIn)) {
            amountOutReal = router.swapExactNATIVEForTokens{value: _amountIn}(
                _minAmountOut,
                path,
                address(this),
                _deadline
            );

            emit TradeCompleted(
                address(this),
                address(router),
                tokenInAddress,
                tokenOutAddress,
                _amountIn,
                amountOutReal,
                _getTokenBalance(address(0)),
                _getTokenBalance(tokenOutAddress)
            );
        } else if (_isWrappedNativeToken(token0 == _tokenIn ? token1 : token0)) {
            amountOutReal = router.swapExactTokensForNATIVE(
                _amountIn,
                _minAmountOut,
                path,
                payable(address(this)),
                _deadline
            );

            emit TradeCompleted(
                address(this),
                address(router),
                tokenInAddress,
                tokenOutAddress,
                _amountIn,
                amountOutReal,
                _getTokenBalance(tokenInAddress),
                _getTokenBalance(address(0))
            );
        } else {
            amountOutReal = router.swapExactTokensForTokens(_amountIn, _minAmountOut, path, address(this), _deadline);

            emit TradeCompleted(
                address(this),
                address(router),
                tokenInAddress,
                tokenOutAddress,
                _amountIn,
                amountOutReal,
                _getTokenBalance(tokenInAddress),
                _getTokenBalance(tokenOutAddress)
            );
        }

        // set the router approval back to 0 for security reasons
        IERC20(_tokenIn).forceApprove(lbSwapData.routerAddress, 0);
    }

    function _buildReversePath(Path memory path) internal pure returns (Path memory rev) {
        uint256 hops = path.pairBinSteps.length;

        // allocate reversed path
        rev.pairBinSteps = new uint256[](hops);
        rev.versions = new Version[](hops);
        rev.tokenPath = new IERC20[](hops + 1);

        // reverse token path
        for (uint256 i; i <= hops; ++i) {
            rev.tokenPath[i] = path.tokenPath[hops - i];
        }

        // reverse hops (pairs + versions)
        for (uint256 i; i < hops; ++i) {
            uint256 j = hops - 1 - i;
            rev.pairBinSteps[i] = path.pairBinSteps[j];
            rev.versions[i] = path.versions[j];
        }
    }
}

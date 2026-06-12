// SPDX-License-Identifier: MIT

pragma solidity 0.8.30;

import {ISwapBaseEvents} from "./interfaces/ISwapBaseEvents.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title SwapBase
 * @author Drew Kerby
 * @notice Base contract providing common functionality for DEX swap implementations
 * @dev This contract manages token pair addresses, wrapped native token configuration, and provides
 *      validation utilities for swap operations. It serves as the foundation for specific DEX implementations.
 */
contract SwapBase is ISwapBaseEvents {
    address token0;
    address token1;
    address wrappedNativeTokenAddress;

    /**
     * @notice Sets the token pair addresses for swaps
     * @param _token0 The address of the first token
     * @param _token1 The address of the second token
     */
    function _setTokens(address _token0, address _token1) internal {
        token0 = _token0;
        token1 = _token1;
    }

    /**
     * @notice Sets the wrapped native token address
     * @param _wrappedNativeTokenAddress The address of the wrapped native token
     */
    function _setWrappedNativeTokenAddress(address _wrappedNativeTokenAddress) internal {
        wrappedNativeTokenAddress = _wrappedNativeTokenAddress;
    }

    /**
     * @notice Validates that a token address is part of the token pair
     * @param _token The token address to validate
     */
    function _checkTokenAddress(address _token) internal view {
        // revert if the token is not token0 or _token1
        if (_token != token0 && _token != token1) {
            revert InvalidTokenAddress();
        }
    }

    /**
     * @notice Checks if a token is the wrapped native token
     * @param _token The token address to check
     * @return True if the token is the wrapped native token
     */
    function _isWrappedNativeToken(address _token) internal view returns (bool) {
        return _token == wrappedNativeTokenAddress;
    }

    /**
     * @notice Retrieves the current balance for the token
     * @param _tokenAddress The address of the token (can be zero address for native)
     * @return The vault token balance struct with current balances and decimals
     */
    function _getTokenBalance(address _tokenAddress) internal view returns (uint256) {
        // if the vault token address is the zero address, get the balance of native
        if (_tokenAddress == address(0)) {
            return address(this).balance;
        } else {
            return ERC20(_tokenAddress).balanceOf(address(this));
        }
    }
}

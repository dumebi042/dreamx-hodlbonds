// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ILBPair} from "src/dex/lfj/interfaces/ILBPair.sol";

interface ILBFactory {
    error LBFactory__IdenticalAddresses(IERC20 token);
    error LBFactory__QuoteAssetNotWhitelisted(IERC20 quoteAsset);
    error LBFactory__QuoteAssetAlreadyWhitelisted(IERC20 quoteAsset);
    error LBFactory__AddressZero();
    error LBFactory__LBPairAlreadyExists(IERC20 tokenX, IERC20 tokenY, uint256 _binStep);
    error LBFactory__LBPairDoesNotExist(IERC20 tokenX, IERC20 tokenY, uint256 binStep);
    error LBFactory__LBPairNotCreated(IERC20 tokenX, IERC20 tokenY, uint256 binStep);
    error LBFactory__FlashLoanFeeAboveMax(uint256 fees, uint256 maxFees);
    error LBFactory__BinStepTooLow(uint256 binStep);
    error LBFactory__PresetIsLockedForUsers(address user, uint256 binStep);
    error LBFactory__LBPairIgnoredIsAlreadyInTheSameState();
    error LBFactory__BinStepHasNoPreset(uint256 binStep);
    error LBFactory__PresetOpenStateIsAlreadyInTheSameState();
    error LBFactory__SameFeeRecipient(address feeRecipient);
    error LBFactory__SameFlashLoanFee(uint256 flashLoanFee);
    error LBFactory__LBPairSafetyCheckFailed(address LBPairImplementation);
    error LBFactory__SameImplementation(address LBPairImplementation);
    error LBFactory__ImplementationNotSet();
    error LBFactory__SameHooksImplementation(address hooksImplementation);
    error LBFactory__SameHooksParameters(bytes32 hooksParameters);
    error LBFactory__InvalidHooksParameters();
    error LBFactory__CannotGrantDefaultAdminRole();

    function createLBPair(
        IERC20 tokenX,
        IERC20 tokenY,
        uint24 activeId,
        uint16 binStep
    ) external returns (ILBPair pair);
}

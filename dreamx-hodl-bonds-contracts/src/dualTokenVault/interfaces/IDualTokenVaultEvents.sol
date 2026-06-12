// SPDX-License-Identifier: MIT

pragma solidity 0.8.30;

import {DualTokenVaultState} from "src/dualTokenVault/types/DualTokenVaultTypes.sol";

interface IDualTokenVaultEvents {
    event BondIssued(
        address indexed creator,
        address indexed vaultToken,
        address indexed stableToken,
        uint256 vaultTokenAmount,
        uint256 stableTokenAmount,
        uint256 managementFeeAmount
    );
    event BondRedeemed(
        address indexed redeemer,
        address indexed vaultToken,
        address indexed stableToken,
        uint256 vaultTokenAmount,
        uint256 stableTokenAmount,
        uint256 performanceFeeVaultTokenAmount,
        uint256 performanceFeeStableTokenAmount
    );
    event OracleFallbackOnRedemption(
        address indexed redeemer,
        address indexed vaultTokenAddress,
        address indexed stableTokenAddress
    );
    event FeeCollected(address indexed to, address indexed token, uint256 amount);

    error PurchaseExceedsBondLimit();
    error BondIssuanceClosed();
    error PaymentTransferFailed();
    error BondNotYetRedeemable();
    error ZeroAmountBondRedemption();
    error RedemptionTransferFailed();
    error TradingPeriodClosed();
    error PoolNotFound();
    error InvalidVaultState(DualTokenVaultState expectedState, DualTokenVaultState actualState);
    error StableTokenTransferFailed();
    error StableTokensNotClaimable();
    error InvalidPriceData();
    error IncorrectNativeTokenAmountSent(uint256 expectedAmount, uint256 actualAmount);
    error FeeTransferFailed();
    error NoValueSentWithTransaction();
    error InvalidMerkleProof();
    error InvalidFactoryAddress();
    error TokenAddressMismatch();
    error StaleOrInvalidPriceData();
    error OnlySelfCanCallFunction();
}

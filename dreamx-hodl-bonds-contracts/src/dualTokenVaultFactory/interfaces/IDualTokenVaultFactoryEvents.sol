// SPDX-License-Identifier: MIT

pragma solidity 0.8.30;

import {ApprovedPair, VaultParameters} from "src/dualTokenVaultFactory/types/DualTokenVaultFactoryTypes.sol";

interface IDualTokenVaultFactoryEvents {
    event VaultCreated(
        address indexed creator,
        uint256 indexed vaultId,
        uint256 indexed pairId,
        address vaultAddress,
        ApprovedPair approvedPair,
        VaultParameters vaultParameters
    );
    event ApprovedPairSet(address indexed sender, uint256 indexed pairId, ApprovedPair approvedPair);
    event ApprovedPairIdsSet(address indexed sender, uint256[] indexed oldPairIds, uint256[] indexed newPairIds);
    event MinUSDPricePerBondUpdated(uint256 oldValue, uint256 newValue);
    event FeeSplitterAddressUpdated(address oldAddress, address newAddress);
    event ManagementFeeUpdated(uint256 oldValue, uint256 newValue);
    event PerformanceFeeUpdated(uint256 oldValue, uint256 newValue);
    event TraderMerkleRootUpdated(bytes32 oldRoot, bytes32 newRoot);

    error VaultDeployerAlreadyDeployed();
    error PaymentTransferFailed();
    error IncorrectNativeTokenAmountSent(uint256 expectedAmount, uint256 actualAmount);
    error InvalidPairId(uint256 pairId);
    error NoValueSentWithTransaction();
    error ReserveRatioOutOfBounds(uint16 reserveRatio);
    error TradingPeriodDurationOutOfBounds(uint32 tradingPeriodDuration);
    error StableTokenAmountBelowMinimumRequired(uint256 minStableTokenAmount, uint256 actualStableTokenAmount);
    error StableTokenAmountExceedsMaximumAllowed(uint256 maxStableTokenAmount, uint256 actualStableTokenAmount);
    error ArrayLengthMismatch(uint256 arrayLength1, uint256 arrayLength2);
    error ZeroPairsProvided();
    error InvalidVaultImplementationAddress();
    error InvalidFeeSplitterAddress();
    error FeeOnTransferNotSupported();
    error ManagementFeeOutOfBounds(uint16 managementFee);
    error PerformanceFeeOutOfBounds(uint16 performanceFee);
    error BasicPoolsNotSupported();
}

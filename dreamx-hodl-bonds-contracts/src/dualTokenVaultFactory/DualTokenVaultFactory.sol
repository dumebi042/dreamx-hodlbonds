// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.30;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {
    VaultParameters,
    VaultCreationData,
    VaultCreationDataWithId,
    ApprovedPair,
    ApprovedPairWithId,
    UserConfigurableVaultParameters
} from "src/dualTokenVaultFactory/types/DualTokenVaultFactoryTypes.sol";
import {IDualTokenVaultFactoryEvents} from "src/dualTokenVaultFactory/interfaces/IDualTokenVaultFactoryEvents.sol";
import {VaultReceiptToken} from "src/vaultReceiptToken/VaultReceiptToken.sol";
import {IDualTokenVault} from "src/dualTokenVault/interfaces/IDualTokenVault.sol";
import {DualTokenVaultState, DualTokenVaultData} from "src/dualTokenVault/types/DualTokenVaultTypes.sol";
import {LiquidityBookSwapParameters} from "src/dex/lfj/types/LiquidityBookSwapTypes.sol";
import {BlackholeSwapParameters} from "src/dex/blackhole/types/BlackholeSwapTypes.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

/**
 * @title DualTokenVaultFactory
 * @author Drew Kerby
 * @notice Factory contract for creating and managing dual-token vault instances
 * @dev This factory uses the minimal proxy pattern (EIP-1167) to deploy vault instances efficiently.
 *      It manages approved trading pairs, fee configurations, and maintains a registry of all created vaults.
 *      Only authorized moderators can update factory settings and approved pairs.
 */
contract DualTokenVaultFactory is AccessControl, IDualTokenVaultFactoryEvents {
    using Clones for address;
    using SafeERC20 for IERC20;

    bytes32 public constant MODERATOR_ROLE = keccak256("MODERATOR_ROLE");
    uint256 constant NUM_BONDS_TO_ISSUE = 1;

    uint256 constant MIN_RESERVE_RATIO = 1000; // 10% in basis points
    uint256 constant MAX_RESERVE_RATIO = 5000; // 50% in basis points
    uint16 constant MAX_MANAGEMENT_FEE = 200; // 2% in basis points
    uint16 constant MAX_PERFORMANCE_FEE = 2000; // 20% in basis points
    uint256 constant MIN_TRADING_PERIOD_DURATION = 90 days;
    uint256 constant MAX_TRADING_PERIOD_DURATION = 365 days;
    uint256 constant BPS_DENOMINATOR = 10_000;

    uint64 public nextVaultId;
    mapping(uint256 => VaultCreationData) public vaults;
    address public receiptTokenAddress;
    address public vaultImplementationAddress;

    mapping(uint256 => ApprovedPair) approvedPairs;
    uint256[] public approvedPairIds;

    uint256 public minUSDPricePerBond; // the minimum USD value of the variable token price of the bond, in the decimals of the stable token (e.g., if stable token is USDC with 6 decimals, and min price is $100, this value would be 100 * 10^6 = 100_000_000)
    address public feeSplitterAddress; // address of the fee splitter contract
    uint16 public managementFee; // management fee in basis points (e.g., 200 = 2%)
    uint16 public performanceFee; // performance fee in basis points (e.g., 2000 = 20%)

    bytes32 traderMerkleRoot;

    /**
     * @notice Constructs the factory contract with initial configuration
     * @param _vaultImplementationAddress The address of the vault implementation contract
     * @param _feeSplitterAddress The address of the fee splitter contract
     * @param _minUSDPricePerBond Minimum USD price per bond (with 18 decimals)
     * @param _managementFee Management fee in basis points
     * @param _performanceFee Performance fee in basis points
     * @param _receiptTokenURI URI for the receipt token metadata
     * @param _traderMerkleRoot Merkle root for authorized traders
     * @param _initialApprovedPairIds Array of initial approved pair IDs
     * @param _initialApprovedPairs Array of initial approved pair configurations
     */
    constructor(
        address _vaultImplementationAddress,
        address _feeSplitterAddress,
        uint256 _minUSDPricePerBond,
        uint16 _managementFee,
        uint16 _performanceFee,
        string memory _receiptTokenURI,
        bytes32 _traderMerkleRoot,
        uint256[] memory _initialApprovedPairIds,
        ApprovedPair[] memory _initialApprovedPairs
    ) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MODERATOR_ROLE, msg.sender);

        nextVaultId = 1;

        minUSDPricePerBond = _minUSDPricePerBond;
        feeSplitterAddress = _feeSplitterAddress;

        receiptTokenAddress = address(new VaultReceiptToken());
        vaultImplementationAddress = _vaultImplementationAddress;

        traderMerkleRoot = _traderMerkleRoot;

        VaultReceiptToken(receiptTokenAddress).setURI(_receiptTokenURI);

        if (_managementFee > MAX_MANAGEMENT_FEE) {
            revert ManagementFeeOutOfBounds(_managementFee);
        }

        if (_performanceFee > MAX_PERFORMANCE_FEE) {
            revert PerformanceFeeOutOfBounds(_performanceFee);
        }

        managementFee = _managementFee;
        performanceFee = _performanceFee;

        if (_vaultImplementationAddress == address(0)) {
            revert InvalidVaultImplementationAddress();
        }

        if (_feeSplitterAddress == address(0)) {
            revert InvalidFeeSplitterAddress();
        }

        if (_initialApprovedPairs.length != _initialApprovedPairIds.length) {
            revert ArrayLengthMismatch(_initialApprovedPairIds.length, _initialApprovedPairs.length);
        }

        if (_initialApprovedPairs.length == 0) {
            revert ZeroPairsProvided();
        }

        approvedPairIds = _initialApprovedPairIds;
        for (uint256 i = 0; i < _initialApprovedPairs.length; i++) {
            _setApprovedPair(_initialApprovedPairIds[i], _initialApprovedPairs[i]);
        }
    }

    /**
     * @notice Creates a new vault and issues a bond in a single transaction
     * @dev Uses minimal proxy pattern to deploy vault. Transfers tokens from caller to vault.
     *      Supports both native tokens and ERC20 tokens. Must be called with appropriate value if using native tokens.
     * @param _userParams User-configurable vault parameters
     * @return The address of the newly created vault
     */
    function createVaultAndIssueBond(
        UserConfigurableVaultParameters memory _userParams
    ) external payable returns (address) {
        _validateUserInput(_userParams);

        uint64 vaultId = nextVaultId++;
        address vault = vaultImplementationAddress.clone();
        require(vault != address(0), "Deployment failed");

        ApprovedPair memory pairInfo = _loadAndValidatePair(_userParams.pairId);

        _initializeVaultWithPair(vault, vaultId, pairInfo, _userParams);

        vaults[vaultId] = VaultCreationData({vaultAddress: vault, userConfig: _userParams});

        _issueBondWithPair(vaultId, vault, pairInfo, _userParams.maxStableTokenAmount, _userParams.reserveRatio);

        emit VaultCreated(
            msg.sender,
            vaultId,
            _userParams.pairId,
            vault,
            pairInfo,
            _buildVaultParamsForEvent(vaultId, pairInfo, _userParams)
        );

        return vault;
    }

    /**
     * @notice Sets the minimum USD price per bond
     * @param _minUSDPricePerBond The new minimum USD price per bond (with 18 decimals)
     */
    function setMinUSDPricePerBond(uint256 _minUSDPricePerBond) external onlyRole(MODERATOR_ROLE) {
        uint256 oldPrice = minUSDPricePerBond;

        minUSDPricePerBond = _minUSDPricePerBond;

        emit MinUSDPricePerBondUpdated(oldPrice, _minUSDPricePerBond);
    }

    /**
     * @notice Sets the fee splitter address
     * @param _feeSplitterAddress The new fee splitter contract address
     */
    function setFeeSplitterAddress(address _feeSplitterAddress) external onlyRole(MODERATOR_ROLE) {
        if (_feeSplitterAddress == address(0)) {
            revert InvalidFeeSplitterAddress();
        }

        address oldAddress = feeSplitterAddress;

        feeSplitterAddress = _feeSplitterAddress;

        emit FeeSplitterAddressUpdated(oldAddress, _feeSplitterAddress);
    }

    /**
     * @notice Sets the management fee
     * @param _managementFee The new management fee in basis points
     */
    function setManagementFee(uint16 _managementFee) external onlyRole(MODERATOR_ROLE) {
        if (_managementFee > MAX_MANAGEMENT_FEE) {
            revert ManagementFeeOutOfBounds(_managementFee);
        }

        uint16 oldFee = managementFee;

        managementFee = _managementFee;

        emit ManagementFeeUpdated(oldFee, _managementFee);
    }

    /**
     * @notice Sets the performance fee
     * @param _performanceFee The new performance fee in basis points
     */
    function setPerformanceFee(uint16 _performanceFee) external onlyRole(MODERATOR_ROLE) {
        if (_performanceFee > MAX_PERFORMANCE_FEE) {
            revert PerformanceFeeOutOfBounds(_performanceFee);
        }

        uint16 oldFee = performanceFee;

        performanceFee = _performanceFee;

        emit PerformanceFeeUpdated(oldFee, _performanceFee);
    }

    /**
     * @notice Sets the Merkle root for authorized traders
     * @param _traderMerkleRoot The new Merkle root for trader authorization
     */
    function setTraderMerkleRoot(bytes32 _traderMerkleRoot) external onlyRole(MODERATOR_ROLE) {
        bytes32 oldRoot = traderMerkleRoot;

        traderMerkleRoot = _traderMerkleRoot;

        emit TraderMerkleRootUpdated(oldRoot, _traderMerkleRoot);
    }

    /**
     * @notice Sets multiple approved pairs at once
     * @param _pairIds Array of pair IDs
     * @param _approvedPairs Array of approved pair configurations
     * @dev This function deletes the existing approved pair IDs and sets the new ones, so it should only be called when
     *      adding or removing multiple pairs at once.
     */
    function setApprovedPairs(
        uint256[] memory _pairIds,
        ApprovedPair[] memory _approvedPairs
    ) external onlyRole(MODERATOR_ROLE) {
        // require that the lengths of the two arrays match
        if (_pairIds.length != _approvedPairs.length) {
            revert ArrayLengthMismatch(_pairIds.length, _approvedPairs.length);
        }

        // prevent the accidental case that all pairs are removed and the array of approved pairIDs is left empty, which would break vault creation
        if (_pairIds.length == 0) {
            revert ZeroPairsProvided();
        }

        delete approvedPairIds;
        approvedPairIds = _pairIds;

        for (uint256 i = 0; i < _pairIds.length; i++) {
            _setApprovedPair(_pairIds[i], _approvedPairs[i]);
        }
    }

    /**
     * @notice Removes all approved pairs
     * @dev This function deletes all approved pair data and the associated IDs.
     */
    function removeAllApprovedPairs() external onlyRole(MODERATOR_ROLE) {
        ApprovedPair memory emptyPair;
        uint256[] memory currentApprovedPairIds = approvedPairIds;

        for (uint256 i = 0; i < currentApprovedPairIds.length; i++) {
            delete approvedPairs[currentApprovedPairIds[i]];
            emit ApprovedPairSet(msg.sender, currentApprovedPairIds[i], emptyPair);
        }

        delete approvedPairIds;
    }

    /**
     * @notice Returns all created vaults
     * @return Array of all vault creation data with their IDs
     */
    function getVaults() external view returns (VaultCreationDataWithId[] memory) {
        // nextVaultId starts at 1, so we need to subtract 1 to get the count
        VaultCreationDataWithId[] memory allVaults = new VaultCreationDataWithId[](nextVaultId - 1);
        for (uint256 i = 1; i < nextVaultId; i++) {
            allVaults[i - 1] = VaultCreationDataWithId({vaultId: uint64(i), vaultCreationData: vaults[i]});
        }
        return allVaults;
    }

    /**
     * @notice Returns vault data for a specific vault ID
     * @param vaultId The ID of the vault to retrieve
     * @return The vault creation data with ID
     */
    function getVault(uint256 vaultId) external view returns (VaultCreationDataWithId memory) {
        return VaultCreationDataWithId({vaultId: uint64(vaultId), vaultCreationData: vaults[vaultId]});
    }

    /**
     * @notice Returns all vaults currently in TRADING state
     * @return Array of active vault creation data with their IDs
     */
    function getActiveVaults() external view returns (VaultCreationDataWithId[] memory) {
        uint256 activeCount = 0;
        for (uint256 i = 1; i < nextVaultId; i++) {
            DualTokenVaultData memory vaultData = IDualTokenVault(payable(vaults[i].vaultAddress)).getVaultData();
            if (vaultData.vaultState == DualTokenVaultState.TRADING) {
                activeCount++;
            }
        }

        uint256 index = 0;
        VaultCreationDataWithId[] memory activeVaults = new VaultCreationDataWithId[](activeCount);
        for (uint256 i = 1; i < nextVaultId; i++) {
            DualTokenVaultData memory vaultData = IDualTokenVault(payable(vaults[i].vaultAddress)).getVaultData();
            if (vaultData.vaultState == DualTokenVaultState.TRADING) {
                activeVaults[index] = VaultCreationDataWithId({vaultId: uint64(i), vaultCreationData: vaults[i]});
                index++;
            }
        }

        return activeVaults;
    }

    /**
     * @notice Returns IDs of all vaults currently in TRADING state
     * @return Array of active vault IDs
     */
    function getActiveVaultIds() external view returns (uint256[] memory) {
        // First pass: count active vaults
        uint256 activeCount = 0;
        for (uint256 i = 1; i < nextVaultId; i++) {
            DualTokenVaultData memory vaultData = IDualTokenVault(payable(vaults[i].vaultAddress)).getVaultData();
            if (vaultData.vaultState == DualTokenVaultState.TRADING) {
                activeCount++;
            }
        }

        // Second pass: collect active vault IDs
        uint256 index = 0;
        uint256[] memory activeVaultIds = new uint256[](activeCount);
        for (uint256 i = 1; i < nextVaultId; i++) {
            DualTokenVaultData memory vaultData = IDualTokenVault(payable(vaults[i].vaultAddress)).getVaultData();
            if (vaultData.vaultState == DualTokenVaultState.TRADING) {
                activeVaultIds[index++] = i;
            }
        }

        return activeVaultIds;
    }

    /**
     * @notice Returns addresses of all vaults currently in TRADING state
     * @return Array of active vault addresses
     */
    function getActiveVaultAddresses() external view returns (address[] memory) {
        // First pass: count active vaults
        uint256 activeCount = 0;
        for (uint256 i = 1; i < nextVaultId; i++) {
            DualTokenVaultData memory vaultData = IDualTokenVault(payable(vaults[i].vaultAddress)).getVaultData();
            if (vaultData.vaultState == DualTokenVaultState.TRADING) {
                activeCount++;
            }
        }

        // Second pass: collect active vault addresses
        uint256 index = 0;
        address[] memory activeVaultAddresses = new address[](activeCount);
        for (uint256 i = 1; i < nextVaultId; i++) {
            DualTokenVaultData memory vaultData = IDualTokenVault(payable(vaults[i].vaultAddress)).getVaultData();
            if (vaultData.vaultState == DualTokenVaultState.TRADING) {
                activeVaultAddresses[index++] = vaults[i].vaultAddress;
            }
        }

        return activeVaultAddresses;
    }

    /**
     * @notice Returns approved pair configuration for a specific pair ID
     * @param _pairId The ID of the pair to retrieve
     * @return The approved pair with its ID
     */
    function getApprovedPair(uint256 _pairId) external view returns (ApprovedPairWithId memory) {
        ApprovedPairWithId memory pairWithId = ApprovedPairWithId({
            pairId: _pairId,
            approvedPair: approvedPairs[_pairId]
        });
        return pairWithId;
    }

    /**
     * @notice Returns all approved pairs
     * @return Array of all approved pairs with their IDs
     */
    function getApprovedPairs() external view returns (ApprovedPairWithId[] memory) {
        uint256 length = approvedPairIds.length;
        ApprovedPairWithId[] memory pairs = new ApprovedPairWithId[](length);
        for (uint256 i = 0; i < length; i++) {
            pairs[i] = ApprovedPairWithId({
                pairId: approvedPairIds[i],
                approvedPair: approvedPairs[approvedPairIds[i]]
            });
        }
        return pairs;
    }

    /**
     * @notice Returns the current Merkle root for trader authorization
     * @return The Merkle root for authorized traders
     */
    function getTraderMerkleRoot() external view returns (bytes32) {
        return traderMerkleRoot;
    }

    /**
     * @notice Initializes a newly deployed vault proxy
     * @param _newVaultProxyAddress The address of the vault proxy to initialize
     * @param _vaultParams The vault parameters
     * @param _lbParams Liquidity Book swap parameters
     * @param _bhParams Blackhole swap parameters
     * @param _wrappedNativeTokenAddress Address of wrapped native token
     */
    function _initializeVault(
        address _newVaultProxyAddress,
        VaultParameters memory _vaultParams,
        LiquidityBookSwapParameters memory _lbParams,
        BlackholeSwapParameters memory _bhParams,
        address _wrappedNativeTokenAddress
    ) internal {
        IDualTokenVault(payable(_newVaultProxyAddress)).initialize(
            _vaultParams,
            _lbParams,
            _bhParams,
            _wrappedNativeTokenAddress,
            address(this)
        );
    }

    function _loadAndValidatePair(uint256 pairId) internal view returns (ApprovedPair memory pairInfo) {
        pairInfo = approvedPairs[pairId];
        if (pairInfo.stableTokenAddress == address(0) || pairInfo.chainlinkPriceOracleAddress == address(0)) {
            revert InvalidPairId(pairId);
        }
    }

    function _issueBondWithPair(
        uint256 vaultId,
        address vault,
        ApprovedPair memory pairInfo,
        uint256 maxStableTokenAmount,
        uint16 reserveRatio
    ) internal {
        _issueBond(
            vaultId,
            maxStableTokenAmount,
            vault,
            pairInfo.vaultTokenAddress,
            pairInfo.stableTokenAddress,
            pairInfo.wrappedNativeTokenAddress,
            reserveRatio
        );
    }

    function _buildVaultParamsForEvent(
        uint64 vaultId,
        ApprovedPair memory pairInfo,
        UserConfigurableVaultParameters memory userParams
    ) internal view returns (VaultParameters memory) {
        return
            VaultParameters({
                vaultId: vaultId,
                vaultTokenAddress: pairInfo.vaultTokenAddress,
                stableTokenAddress: pairInfo.stableTokenAddress,
                receiptTokenAddress: receiptTokenAddress,
                chainlinkPriceOracleAddress: pairInfo.chainlinkPriceOracleAddress,
                minUSDPricePerBond: minUSDPricePerBond,
                feeSplitterAddress: feeSplitterAddress,
                managementFee: managementFee,
                performanceFee: performanceFee,
                bondPrice: userParams.bondPrice,
                reserveRatio: userParams.reserveRatio,
                tradingPeriodDuration: userParams.tradingPeriodDuration,
                maxPriceAge: pairInfo.maxPriceAge,
                primaryDex: userParams.primaryDex
            });
    }

    function _initializeVaultWithPair(
        address vault,
        uint64 vaultId,
        ApprovedPair memory pairInfo,
        UserConfigurableVaultParameters memory userParams
    ) internal {
        VaultParameters memory vaultParams = VaultParameters({
            vaultId: vaultId,
            vaultTokenAddress: pairInfo.vaultTokenAddress,
            stableTokenAddress: pairInfo.stableTokenAddress,
            receiptTokenAddress: receiptTokenAddress,
            chainlinkPriceOracleAddress: pairInfo.chainlinkPriceOracleAddress,
            minUSDPricePerBond: minUSDPricePerBond,
            feeSplitterAddress: feeSplitterAddress,
            managementFee: managementFee,
            performanceFee: performanceFee,
            bondPrice: userParams.bondPrice,
            reserveRatio: userParams.reserveRatio,
            tradingPeriodDuration: userParams.tradingPeriodDuration,
            maxPriceAge: pairInfo.maxPriceAge,
            primaryDex: userParams.primaryDex
        });

        LiquidityBookSwapParameters memory lbParams = LiquidityBookSwapParameters({
            routerAddress: pairInfo.routerAddress,
            path: pairInfo.swapPath
        });

        BlackholeSwapParameters memory bhParams = BlackholeSwapParameters({
            routerV2Address: pairInfo.routerV2Address,
            routes: pairInfo.swapRoutes
        });

        _initializeVault(vault, vaultParams, lbParams, bhParams, pairInfo.wrappedNativeTokenAddress);
    }

    /**
     * @notice Handles bond issuance and token transfers
     * @dev Transfers vault tokens and stable tokens from caller to vault. Handles both native and ERC20 tokens.
     * @param _maxStableInputAmount Maximum stable token amount allowed
     * @param _newVaultProxyAddress The address of the vault
     * @param _vaultTokenAddress The vault token address (zero for native)
     * @param _stableTokenAddress The stable token address
     * @param _wrappedNativeTokenAddress The wrapped native token address
     */
    function _issueBond(
        uint256 _vaultId,
        uint256 _maxStableInputAmount,
        address _newVaultProxyAddress,
        address _vaultTokenAddress,
        address _stableTokenAddress,
        address _wrappedNativeTokenAddress,
        uint16 _reserveRatio
    ) internal {
        // Note: the two-step transfer is so that the user only spends gas to approve transfer to the factory, not each new vault
        (uint256 bondAmount, uint256 feeAmount, uint256 stableTokenAmount) = IDualTokenVault(
            payable(_newVaultProxyAddress)
        ).issueBond(msg.sender);

        _validateStableTokenInputAmount(stableTokenAmount, minUSDPricePerBond, _maxStableInputAmount, _reserveRatio);

        // if the vault token is the wrapped native token, ensure the correct amount of native token was sent
        if (_vaultTokenAddress == address(0) && _wrappedNativeTokenAddress != address(0)) {
            if (msg.value != bondAmount + feeAmount) {
                revert IncorrectNativeTokenAmountSent(bondAmount + feeAmount, msg.value);
            }

            // send the bond amount to the vault
            (bool success, ) = _newVaultProxyAddress.call{value: bondAmount}("");
            if (!success) {
                revert PaymentTransferFailed();
            }

            // send the fee amount to the fee splitter
            (success, ) = feeSplitterAddress.call{value: feeAmount}("");
            if (!success) {
                revert PaymentTransferFailed();
            }
        } else {
            if (_vaultTokenAddress == address(0)) {
                revert NoValueSentWithTransaction();
            }

            // do to the two-step transfer pattern, the user must have approved the factory to transfer the vault tokens on their behalf before calling this function
            // we explicity reject fee-on-transfer tokens here
            _safeTransferFromExact(IERC20(_vaultTokenAddress), msg.sender, bondAmount + feeAmount);
            IERC20(_vaultTokenAddress).safeTransfer(_newVaultProxyAddress, bondAmount);
            IERC20(_vaultTokenAddress).safeTransfer(feeSplitterAddress, feeAmount);
        }

        // transfer the stable tokens from the user to the factory, then to the vault.
        // we reject fee-on-transfer tokens here as well
        _safeTransferFromExact(IERC20(_stableTokenAddress), msg.sender, stableTokenAmount);
        IERC20(_stableTokenAddress).safeTransfer(_newVaultProxyAddress, stableTokenAmount);

        // mint an ERC1155 token to the sender as a receipt token, now that the transfers have succeeded.
        VaultReceiptToken(receiptTokenAddress).mint(msg.sender, _vaultId, NUM_BONDS_TO_ISSUE, "");
    }

    /**
     * @notice Internal function to set an approved pair and emit event
     * @param _pairId The ID of the pair to set
     * @param _approvedPair The approved pair configuration
     */
    function _setApprovedPair(uint256 _pairId, ApprovedPair memory _approvedPair) internal {
        // check all of the blackhole swap routes to make sure they aren't using any basic pools
        for (uint256 i = 0; i < _approvedPair.swapRoutes.length; i++) {
            if (!_approvedPair.swapRoutes[i].concentrated) {
                revert BasicPoolsNotSupported();
            }
        }

        approvedPairs[_pairId] = _approvedPair;
        emit ApprovedPairSet(msg.sender, _pairId, _approvedPair);
    }

    /**
     * @notice Validates user-configurable vault parameters
     * @param _userConfig The user configuration to validate
     */
    function _validateUserInput(UserConfigurableVaultParameters memory _userConfig) internal pure {
        if (_userConfig.reserveRatio < MIN_RESERVE_RATIO || _userConfig.reserveRatio > MAX_RESERVE_RATIO) {
            revert ReserveRatioOutOfBounds(_userConfig.reserveRatio);
        }

        if (
            _userConfig.tradingPeriodDuration < MIN_TRADING_PERIOD_DURATION ||
            _userConfig.tradingPeriodDuration > MAX_TRADING_PERIOD_DURATION
        ) {
            revert TradingPeriodDurationOutOfBounds(_userConfig.tradingPeriodDuration);
        }
    }

    /**
     * @notice Validates that stable token amount is within acceptable range
     * @param _actualStableTokenAmount The actual stable token amount
     * @param _minUSDPricePerBond The minimum allowed stable token amount
     * @param _maxStableTokenAmount The maximum allowed stable token amount
     */
    function _validateStableTokenInputAmount(
        uint256 _actualStableTokenAmount,
        uint256 _minUSDPricePerBond,
        uint256 _maxStableTokenAmount,
        uint16 _reserveRatio
    ) internal pure {
        // check that the USD value of the variable tokens deposited meets the minimum
        uint256 bondPriceInStableTokens = (_actualStableTokenAmount * BPS_DENOMINATOR) / _reserveRatio;
        if (bondPriceInStableTokens < _minUSDPricePerBond) {
            revert StableTokenAmountBelowMinimumRequired(_minUSDPricePerBond, _actualStableTokenAmount);
        }

        // check that the stable token amount does not exceed the user-specified maximum
        if (_actualStableTokenAmount > _maxStableTokenAmount) {
            revert StableTokenAmountExceedsMaximumAllowed(_maxStableTokenAmount, _actualStableTokenAmount);
        }
    }

    /**
     * @notice Internal function to safely transfer tokens and check for fee-on-transfer
     * @param _token The ERC20 token to transfer
     * @param _from The address to transfer from
     * @param _amount The amount of tokens to transfer
     */
    function _safeTransferFromExact(IERC20 _token, address _from, uint256 _amount) internal {
        uint256 beforeBal = _token.balanceOf(address(this));
        _token.safeTransferFrom(_from, address(this), _amount);
        uint256 afterBal = _token.balanceOf(address(this));

        if (afterBal - beforeBal != _amount) {
            revert FeeOnTransferNotSupported();
        }
    }
}

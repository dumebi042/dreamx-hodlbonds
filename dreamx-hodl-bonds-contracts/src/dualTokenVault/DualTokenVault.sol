// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.30;

import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {VaultReceiptToken} from "src/vaultReceiptToken/VaultReceiptToken.sol";
import {IDualTokenVaultEvents} from "src/dualTokenVault/interfaces/IDualTokenVaultEvents.sol";
import {VaultParameters} from "src/dualTokenVaultFactory/types/DualTokenVaultFactoryTypes.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {DualTokenVaultState} from "src/dualTokenVault/types/DualTokenVaultTypes.sol";
import {LiquidityBookSwap} from "src/dex/lfj/LiquidityBookSwap.sol";
import {LiquidityBookSwapParameters} from "src/dex/lfj/types/LiquidityBookSwapTypes.sol";
import {AggregatorV3Interface} from "src/oracles/chainlink/interfaces/AggregatorV3Interface.sol";
import {BlackholeSwap} from "src/dex/blackhole/BlackholeSwap.sol";
import {BlackholeSwapParameters} from "src/dex/blackhole/types/BlackholeSwapTypes.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {DualTokenVaultData, VaultTokenBalance} from "src/dualTokenVault/types/DualTokenVaultTypes.sol";
import {IDualTokenVaultFactory} from "src/dualTokenVaultFactory/interfaces/IDualTokenVaultFactory.sol";
import {MerkleTreeHelper} from "src/lib/MerkleTreeHelper.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title DualTokenVault
 * @author Drew Kerby
 * @notice Manages a dual-token bond vault that allows trading between a vault token and a stable token
 * @dev This contract handles the complete lifecycle of a bond: issuance, trading period, and redemption.
 *      It integrates with DEX protocols (Liquidity Book and Blackhole) for token swaps during the trading period.
 *      The vault tracks balances, calculates fees, and manages state transitions between BOND_ISSUANCE, TRADING, and SETTLED states.
 */
contract DualTokenVault is Initializable, IDualTokenVaultEvents, AccessControl, LiquidityBookSwap, BlackholeSwap {
    using SafeERC20 for IERC20;

    uint256 constant NATIVE_TOKEN_DECIMALS = 18;
    uint256 constant BPS_DENOMINATOR = 10_000;
    uint256 constant BOND_LIMIT = 1;

    VaultParameters vaultParameters;

    DualTokenVaultState vaultState;
    uint256 startingStableTokenBalance;
    uint256 startingVaultTokenBalance;
    uint256 creationTimestamp;
    address issuerAddress;
    address factoryAddress;

    /**
     * @dev Locks the implementation contract by disabling initializers.
     * @notice Prevents direct initialization; use {initialize} via proxy instead.
     */
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Receives native tokens sent to the vault
     */
    receive() external payable {}

    /**
     * @notice Initializes the vault with configuration parameters and swap data
     * @param _vaultParameters The vault configuration parameters
     * @param _lbSwapData Parameters for Liquidity Book swap integration
     * @param _blackholeSwapData Parameters for Blackhole swap integration
     * @param _wrappedNativeTokenAddress Address of the wrapped native token (zero address if not applicable)
     * @param _factoryAddress Address of the vault factory contract
     */
    function initialize(
        VaultParameters memory _vaultParameters,
        LiquidityBookSwapParameters memory _lbSwapData,
        BlackholeSwapParameters memory _blackholeSwapData,
        address _wrappedNativeTokenAddress,
        address _factoryAddress
    ) external initializer {
        // make sure that the token addresses in the swap data match each other prior to initializing the swap contracts
        _checkTokenMatch(
            address(_lbSwapData.path.tokenPath[0]),
            address(_lbSwapData.path.tokenPath[_lbSwapData.path.tokenPath.length - 1]),
            address(_blackholeSwapData.routes[0].from),
            address(_blackholeSwapData.routes[_blackholeSwapData.routes.length - 1].to),
            _wrappedNativeTokenAddress
        );

        // also check that the token addresses in the swap data match the vault configuration parameters
        // we don't need to explicitly check the blackhole swap data against the vault parameters
        // since the LB and Blackhole swap addresses are checked against each other
        _checkTokenMatch(
            _vaultParameters.vaultTokenAddress,
            _vaultParameters.stableTokenAddress,
            address(_lbSwapData.path.tokenPath[0]),
            address(_lbSwapData.path.tokenPath[_lbSwapData.path.tokenPath.length - 1]),
            _wrappedNativeTokenAddress
        );

        // initialize the swap contracts
        _initializeLiquidityBookSwap(_lbSwapData, _wrappedNativeTokenAddress);
        _initializeBlackholeSwap(_blackholeSwapData, _wrappedNativeTokenAddress);

        // grant the access control roles to caller (which should always be the vault factory)
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        // save the vault parameters to the config struct
        vaultParameters = _vaultParameters;

        // save the creation timestamp
        creationTimestamp = block.timestamp;

        // set the initial vault state to the BOND_SALE state
        vaultState = DualTokenVaultState.BOND_ISSUANCE;

        // make sure that the factory address is not the zero address, as it is needed to verify trader Merkle proofs during swaps
        if (_factoryAddress == address(0)) {
            revert InvalidFactoryAddress();
        }

        // set the factory factoryAddress
        factoryAddress = _factoryAddress;
    }

    /**
     * @notice Issues a bond to the specified issuer address
     * @dev Transitions vault from BOND_ISSUANCE to TRADING state. Calculates fees and stable token requirements.
     *      Mints a receipt token to the issuer. Can only be called when vault is in BOND_ISSUANCE state.
     * @param _issuerAddress The address that will receive the bond receipt token
     * @return bondPriceBeforeFee The bond price before management fee deduction
     * @return feeAmount The management fee amount deducted
     * @return stableTokenAmount The required stable token amount for the bond
     */
    function issueBond(address _issuerAddress) external returns (uint256, uint256, uint256) {
        VaultParameters memory vaultConfig = vaultParameters;

        // ensure that bond issuance is only possible right after bond creation
        if (vaultState != DualTokenVaultState.BOND_ISSUANCE) {
            revert BondIssuanceClosed();
        }

        issuerAddress = _issuerAddress;

        // calculate the total payment amount plus the fee
        uint256 bondPriceBeforeFee = vaultConfig.bondPrice;
        uint256 feeAmount = Math.mulDiv(
            bondPriceBeforeFee,
            vaultConfig.managementFee,
            BPS_DENOMINATOR,
            Math.Rounding.Floor
        );

        uint256 stableTokenAmount = _getRequiredStableTokenAmount(
            vaultConfig.bondPrice,
            vaultConfig.reserveRatio,
            vaultConfig.vaultTokenAddress,
            vaultConfig.stableTokenAddress,
            vaultConfig.chainlinkPriceOracleAddress
        );

        startingStableTokenBalance = stableTokenAmount;
        startingVaultTokenBalance = bondPriceBeforeFee;

        // transition the vault state to TRADING
        vaultState = DualTokenVaultState.TRADING;

        emit BondIssued(
            _issuerAddress,
            vaultConfig.vaultTokenAddress,
            vaultConfig.stableTokenAddress,
            vaultConfig.bondPrice,
            stableTokenAmount,
            feeAmount
        );

        emit FeeCollected(vaultConfig.feeSplitterAddress, vaultConfig.vaultTokenAddress, feeAmount);

        return (bondPriceBeforeFee, feeAmount, stableTokenAmount);
    }

    /**
     * @notice Redeems the bond and settles all token transfers
     * @dev Transitions vault from TRADING to SETTLED state. Calculates performance fees if profit was made.
     *      Transfers vault tokens and stable tokens back to the redeemer. Burns the receipt token.
     *      Can only be called after the trading period has ended and vault is in TRADING state.
     */
    function redeemBond() external {
        VaultParameters memory vaultConfig = vaultParameters;

        uint256 redemptionAllowedTimestamp = _getTradingPeriodEndTimestamp(vaultConfig.tradingPeriodDuration);

        if (vaultState != DualTokenVaultState.TRADING) {
            revert InvalidVaultState(DualTokenVaultState.TRADING, vaultState);
        }

        if (redemptionAllowedTimestamp > block.timestamp) {
            revert BondNotYetRedeemable();
        }

        // transition the contract to the settled state
        vaultState = DualTokenVaultState.SETTLED;

        // Burn the ERC1155 token from the sender, which serves as proof of bond ownership and right to redeem
        VaultReceiptToken(vaultConfig.receiptTokenAddress).burn(msg.sender, vaultConfig.vaultId, BOND_LIMIT);

        // handle all of the token transfers and fee deductions
        _settle(
            msg.sender,
            vaultConfig.vaultTokenAddress,
            vaultConfig.stableTokenAddress,
            IDualTokenVaultFactory(factoryAddress).feeSplitterAddress(),
            vaultConfig.bondPrice,
            vaultConfig.performanceFee
        );
    }

    /**
     * @notice Executes a swap using Liquidity Book DEX
     * @dev Verifies the caller is an authorized trader via Merkle proof. Can only be called during trading period.
     * @param _amountIn The exact amount of input tokens to swap
     * @param _minAmountOut The minimum amount of output tokens expected
     * @param _tokenIn The address of the input token (zero address for native token)
     * @param _deadline The deadline timestamp for the swap transaction
     * @param _proof Merkle proof to verify trader authorization
     */
    function lbSwapExactInputSingle(
        uint128 _amountIn,
        uint128 _minAmountOut,
        address _tokenIn,
        uint256 _deadline,
        bytes32[] memory _proof
    ) external {
        if (vaultState != DualTokenVaultState.TRADING) {
            revert InvalidVaultState(DualTokenVaultState.TRADING, vaultState);
        }

        if (_getTradingPeriodEndTimestamp(vaultParameters.tradingPeriodDuration) < block.timestamp) {
            revert TradingPeriodClosed();
        }

        // verify that the caller is an authorized trader using the merkle proof
        bytes32 merkleRoot = IDualTokenVaultFactory(factoryAddress).getTraderMerkleRoot();
        if (!_proofVerified(merkleRoot, _getLeaf(msg.sender), _proof)) {
            revert InvalidMerkleProof();
        }

        _lbSwapExactInputSingle(_amountIn, _minAmountOut, _tokenIn, _deadline);
    }

    /**
     * @notice Executes a swap using Blackhole DEX
     * @dev Verifies the caller is an authorized trader via Merkle proof. Can only be called during trading period.
     * @param _amountIn The exact amount of input tokens to swap
     * @param _minAmountOut The minimum amount of output tokens expected
     * @param _tokenIn The address of the input token (zero address for native token)
     * @param _deadline The deadline timestamp for the swap transaction
     * @param _proof Merkle proof to verify trader authorization
     */
    function blackholeSwapExactInputSingle(
        uint128 _amountIn,
        uint128 _minAmountOut,
        address _tokenIn,
        uint256 _deadline,
        bytes32[] memory _proof
    ) external {
        if (vaultState != DualTokenVaultState.TRADING) {
            revert InvalidVaultState(DualTokenVaultState.TRADING, vaultState);
        }

        if (_getTradingPeriodEndTimestamp(vaultParameters.tradingPeriodDuration) < block.timestamp) {
            revert TradingPeriodClosed();
        }

        // verify that the caller is an authorized trader using the merkle proof
        bytes32 merkleRoot = IDualTokenVaultFactory(factoryAddress).getTraderMerkleRoot();
        if (!_proofVerified(merkleRoot, _getLeaf(msg.sender), _proof)) {
            revert InvalidMerkleProof();
        }

        _blackholeSwapExactInputSingle(_amountIn, _minAmountOut, _tokenIn, _deadline);
    }

    /**
     * @notice Returns the vault configuration parameters
     * @return The vault parameters struct containing all configuration data
     */
    function getVaultConfig() external view returns (VaultParameters memory) {
        return _getVaultParameters();
    }

    /**
     * @notice Returns the current vault state and data
     * @return The vault data struct containing state, balances, issuer, and timestamp information
     */
    function getVaultData() external view returns (DualTokenVaultData memory) {
        return _getVaultData();
    }

    /**
     * @notice Returns the current token balances in the vault
     * @return The vault token balance struct containing balances and decimals for both tokens
     */
    function getVaultTokenBalance() external view returns (VaultTokenBalance memory) {
        return _getVaultTokenBalance();
    }

    /**
     * @notice Calculates the required stable token amount based on vault token input amount and price
     * @param _vaultTokenAmount The amount of vault tokens
     * @param _reserveRatio The reserve ratio in basis points
     * @param _vaultTokenAddress The address of the vault token
     * @param _stableTokenAddress The address of the stable tokens
     * @param _chainlinkPriceOracleAddress The address of the Chainlink price oracle
     * @return The required stable token amount
     */
    function getRequiredStableTokenAmount(
        uint256 _vaultTokenAmount,
        uint256 _reserveRatio,
        address _vaultTokenAddress,
        address _stableTokenAddress,
        address _chainlinkPriceOracleAddress
    ) external view returns (uint256) {
        return
            _getRequiredStableTokenAmount(
                _vaultTokenAmount,
                _reserveRatio,
                _vaultTokenAddress,
                _stableTokenAddress,
                _chainlinkPriceOracleAddress
            );
    }

    /**
     * @notice Attempts to compute total portfolio value in vault-token terms using the oracle.
     * @dev    Called via this.try... pattern so the caller can catch oracle failures.
     *         Marked external so it is reachable via low-level CALL for try/catch.
     * @return startingTotalValue  Starting vault+stable value in vault-token units
     * @return endingTotalValue    Ending vault+stable value in vault-token units
     */
    function _tryComputeOracleValues(
        uint256 _startingStableTokenBalance,
        uint256 _startingVaultTokenBalance,
        address _vaultTokenAddress,
        address _stableTokenAddress,
        address _chainlinkPriceOracleAddress,
        uint256 _currentVaultTokenBalance,
        uint256 _currentStableTokenBalance
    ) external view returns (uint256 startingTotalValue, uint256 endingTotalValue) {
        // Caller must be this contract — prevents external misuse
        if (msg.sender != address(this)) {
            revert OnlySelfCanCallFunction();
        }

        uint256 startingStableAsVault = _convertStableToVaultTokens(
            _startingStableTokenBalance,
            _vaultTokenAddress,
            _stableTokenAddress,
            _chainlinkPriceOracleAddress
        );

        uint256 endingStableAsVault = _convertStableToVaultTokens(
            _currentStableTokenBalance,
            _vaultTokenAddress,
            _stableTokenAddress,
            _chainlinkPriceOracleAddress
        );

        startingTotalValue = _startingVaultTokenBalance + startingStableAsVault;
        endingTotalValue = _currentVaultTokenBalance + endingStableAsVault;
    }

    /**
     * @notice Internal function to settle bond redemption and distribute tokens
     * @dev Profit is measured in vault-token terms across BOTH token balances.
     *      Performance fee is taken in vault tokens first; any shortfall is covered
     *      by the equivalent value in stable tokens. Management fee is NOT re-deducted
     *      here — it was already collected at issuance.
     *
     * Starting value (vault token terms):
     *   startingVaultTokenBalance + convert(startingStableTokenBalance → vault tokens)
     *
     * Ending value (vault token terms):
     *   currentVaultTokenBalance  + convert(currentStableTokenBalance  → vault tokens)
     *
     * Performance fee = (endingValue - startingValue) * performanceFee / BPS_DENOMINATOR
     *                   (only if endingValue > startingValue)
     *
     * @param _redeemer             The address redeeming the bond
     * @param _vaultTokenAddress    The address of the vault token (zero address = native)
     * @param _stableTokenAddress   The address of the stable token
     * @param _feeSplitterAddress   The address to receive performance fees
     * @param _bondPrice            The original bond price (= startingVaultTokenBalance)
     * @param _performanceFee       The performance fee in basis points
     */
    function _settle(
        address _redeemer,
        address _vaultTokenAddress,
        address _stableTokenAddress,
        address _feeSplitterAddress,
        uint256 _bondPrice,
        uint256 _performanceFee
    ) internal {
        VaultParameters memory vaultConfig = vaultParameters;
        VaultTokenBalance memory balances = _getVaultTokenBalance();

        bool vaultTokenIsNativeToken = _vaultTokenAddress == address(0);

        // -------------------------------------------------------------------------
        //  Calculate performance fee
        //      Try oracle-aware cross-token logic first; fall back to vault-token-
        //      only comparison if the oracle is unavailable.
        // -------------------------------------------------------------------------
        uint256 performanceFeeVault;
        uint256 performanceFeeStable;

        try
            this._tryComputeOracleValues(
                startingStableTokenBalance,
                startingVaultTokenBalance,
                _vaultTokenAddress,
                _stableTokenAddress,
                vaultConfig.chainlinkPriceOracleAddress,
                balances.vaultTokenBalance,
                balances.stableTokenBalance
            )
        returns (uint256 startingTotalValue, uint256 endingTotalValue) {
            // --- Oracle path: fee on total portfolio profit in vault-token terms ---
            if (endingTotalValue > startingTotalValue) {
                uint256 profit = endingTotalValue - startingTotalValue;
                uint256 totalFeeInVault = Math.mulDiv(profit, _performanceFee, BPS_DENOMINATOR, Math.Rounding.Floor);

                if (totalFeeInVault <= balances.vaultTokenBalance) {
                    performanceFeeVault = totalFeeInVault;
                } else {
                    // Drain vault tokens first, cover remainder in stable tokens
                    performanceFeeVault = balances.vaultTokenBalance;
                    uint256 remainingFeeInVault = totalFeeInVault - performanceFeeVault;

                    (int256 latestPrice, uint8 priceDecimals, ) = _getLatestPriceAndDecimals(
                        vaultConfig.chainlinkPriceOracleAddress
                    );
                    uint8 vaultTokenDecimals = vaultTokenIsNativeToken
                        ? uint8(NATIVE_TOKEN_DECIMALS)
                        : ERC20(_vaultTokenAddress).decimals();
                    uint8 stableTokenDecimals = ERC20(_stableTokenAddress).decimals();

                    performanceFeeStable = _convertTokenAmount(
                        remainingFeeInVault,
                        uint256(latestPrice),
                        vaultTokenDecimals,
                        stableTokenDecimals,
                        priceDecimals
                    );

                    if (performanceFeeStable > balances.stableTokenBalance) {
                        performanceFeeStable = balances.stableTokenBalance;
                    }
                }
            }
        } catch {
            // --- Fallback path: oracle unavailable, fee on vault-token balance only ---
            if (balances.vaultTokenBalance > _bondPrice) {
                uint256 profit = balances.vaultTokenBalance - _bondPrice;
                performanceFeeVault = Math.mulDiv(profit, _performanceFee, BPS_DENOMINATOR, Math.Rounding.Floor);
            }
            emit OracleFallbackOnRedemption(_redeemer, _vaultTokenAddress, _stableTokenAddress);
        }

        // -------------------------------------------------------------------------
        //  Send performance fee to fee splitter
        // -------------------------------------------------------------------------
        if (performanceFeeVault > 0) {
            if (vaultTokenIsNativeToken) {
                (bool ok, ) = _feeSplitterAddress.call{value: performanceFeeVault}("");
                if (!ok) revert FeeTransferFailed();
            } else {
                IERC20(_vaultTokenAddress).safeTransfer(_feeSplitterAddress, performanceFeeVault);
            }
            emit FeeCollected(_feeSplitterAddress, _vaultTokenAddress, performanceFeeVault);
        }

        if (performanceFeeStable > 0) {
            IERC20(_stableTokenAddress).safeTransfer(_feeSplitterAddress, performanceFeeStable);
            emit FeeCollected(_feeSplitterAddress, _stableTokenAddress, performanceFeeStable);
        }

        // -------------------------------------------------------------------------
        //  Send remaining vault tokens to redeemer
        // -------------------------------------------------------------------------
        uint256 redemptionVaultAmount = balances.vaultTokenBalance - performanceFeeVault;

        if (redemptionVaultAmount > 0) {
            if (vaultTokenIsNativeToken) {
                (bool ok, ) = _redeemer.call{value: redemptionVaultAmount}("");
                if (!ok) revert RedemptionTransferFailed();
            } else {
                IERC20(_vaultTokenAddress).safeTransfer(_redeemer, redemptionVaultAmount);
            }
        }

        // -------------------------------------------------------------------------
        //  Send remaining stable tokens to redeemer
        // -------------------------------------------------------------------------
        uint256 redemptionStableAmount = balances.stableTokenBalance - performanceFeeStable;

        if (redemptionStableAmount > 0) {
            IERC20(_stableTokenAddress).safeTransfer(_redeemer, redemptionStableAmount);
        }

        emit BondRedeemed(
            _redeemer,
            _vaultTokenAddress,
            _stableTokenAddress,
            redemptionVaultAmount,
            redemptionStableAmount,
            performanceFeeVault,
            performanceFeeStable
        );
    }

    /**
     * @notice Calculates the timestamp when the trading period ends
     * @param _tradingPeriodDuration The duration of the trading period in seconds
     * @return The timestamp when trading period ends
     */
    function _getTradingPeriodEndTimestamp(uint256 _tradingPeriodDuration) internal view returns (uint256) {
        return creationTimestamp + _tradingPeriodDuration;
    }

    /**
     * @notice Retrieves the current token balances in the vault
     * @dev Handles both native tokens and ERC20 tokens, returning balances and decimals
     * @return The vault token balance struct with current balances and decimals
     */
    function _getVaultTokenBalance() internal view returns (VaultTokenBalance memory) {
        VaultParameters memory vaultConfig = vaultParameters;

        VaultTokenBalance memory balances;
        // if the vault token address is the zero address, get the balance of native
        if (vaultConfig.vaultTokenAddress == address(0)) {
            balances.vaultTokenBalance = address(this).balance;
            balances.vaultTokenDecimals = 18; // native token decimals
        } else {
            balances.vaultTokenBalance = ERC20(vaultConfig.vaultTokenAddress).balanceOf(address(this));
            balances.vaultTokenDecimals = ERC20(vaultConfig.vaultTokenAddress).decimals();
        }

        balances.stableTokenBalance = ERC20(vaultConfig.stableTokenAddress).balanceOf(address(this));
        balances.stableTokenDecimals = ERC20(vaultConfig.stableTokenAddress).decimals();

        return balances;
    }

    /**
     * @notice Calculates the required stable token amount based on vault token input amount
     * @dev Values already in memory are passed as parameters to save gas
     * @param _vaultTokenAddress The address of the vault token
     * @param _stableTokenAddress The address of the stable tokens
     * @param _vaultTokenAmount The amount of vault tokens
     * @param _reserveRatio The reserve ratio in basis points
     * @param _chainlinkPriceOracleAddress The address of the Chainlink price oracle
     * @return The required stable token amount
     */
    function _getRequiredStableTokenAmount(
        uint256 _vaultTokenAmount,
        uint256 _reserveRatio,
        address _vaultTokenAddress,
        address _stableTokenAddress,
        address _chainlinkPriceOracleAddress
    ) internal view returns (uint256) {
        (int256 latestPrice, uint8 priceDecimals, bool priceDataIsValid) = _getLatestPriceAndDecimals(
            _chainlinkPriceOracleAddress
        );

        if (!priceDataIsValid) {
            revert StaleOrInvalidPriceData();
        }

        uint256 vaultTokenDecimals = _vaultTokenAddress == address(0)
            ? NATIVE_TOKEN_DECIMALS
            : ERC20(_vaultTokenAddress).decimals();

        uint256 stableTokenDecimals = ERC20(_stableTokenAddress).decimals();

        if (latestPrice <= 0) {
            revert InvalidPriceData();
        }

        return
            _convertTokenAmount(
                (_vaultTokenAmount * _reserveRatio) / BPS_DENOMINATOR,
                uint256(latestPrice),
                uint8(vaultTokenDecimals),
                uint8(stableTokenDecimals),
                priceDecimals
            );
    }

    /**
     * @notice Converts a stable token amount to its equivalent in vault tokens using the Chainlink oracle
     * @dev Inverse of _getRequiredStableTokenAmount. Reverts on stale/invalid price data.
     * @param _stableTokenAmount   Amount of stable tokens to convert
     * @param _vaultTokenAddress   Address of the vault token (zero address = native)
     * @param _stableTokenAddress  Address of the stable token
     * @param _chainlinkPriceOracleAddress  Chainlink feed (vault token priced in stable token)
     * @return Equivalent vault token amount
     */
    function _convertStableToVaultTokens(
        uint256 _stableTokenAmount,
        address _vaultTokenAddress,
        address _stableTokenAddress,
        address _chainlinkPriceOracleAddress
    ) internal view returns (uint256) {
        (int256 latestPrice, uint8 priceDecimals, bool priceDataIsValid) = _getLatestPriceAndDecimals(
            _chainlinkPriceOracleAddress
        );

        if (!priceDataIsValid) revert StaleOrInvalidPriceData();
        if (latestPrice <= 0) revert InvalidPriceData();

        uint256 vaultTokenDecimals = _vaultTokenAddress == address(0)
            ? NATIVE_TOKEN_DECIMALS
            : ERC20(_vaultTokenAddress).decimals();

        uint256 stableTokenDecimals = ERC20(_stableTokenAddress).decimals();
        uint256 price = uint256(latestPrice);

        if (vaultTokenDecimals + priceDecimals >= stableTokenDecimals) {
            uint256 scale = 10 ** (vaultTokenDecimals + priceDecimals - stableTokenDecimals);
            return Math.mulDiv(_stableTokenAmount, scale, price);
        } else {
            uint256 scale = 10 ** (stableTokenDecimals - vaultTokenDecimals - priceDecimals);
            return Math.mulDiv(_stableTokenAmount, 1, price * scale);
        }
    }

    /**
     * @notice Retrieves the latest price and decimals from Chainlink price oracle
     * @return The latest price as int256
     * @return The number of decimals for the price
     * @return A boolean indicating whether the price data is valid
     */
    function _getLatestPriceAndDecimals(
        address _chainlinkPriceOracleAddress
    ) internal view returns (int256, uint8, bool) {
        AggregatorV3Interface priceFeed = AggregatorV3Interface(_chainlinkPriceOracleAddress);
        (uint80 roundId, int256 price, , uint256 updatedAt, uint80 answeredInRound) = priceFeed.latestRoundData();
        uint8 decimals = priceFeed.decimals();

        // if any of the conditions are invalid, return false to indicate invalid price data
        if (updatedAt == 0 || answeredInRound < roundId || block.timestamp - updatedAt > vaultParameters.maxPriceAge) {
            return (0, 0, false);
        }

        return (price, decimals, true);
    }

    /**
     * @notice Returns the stored vault parameters
     * @return The vault parameters struct
     */
    function _getVaultParameters() internal view returns (VaultParameters memory) {
        return vaultParameters;
    }

    /**
     * @notice Constructs and returns the vault data struct
     * @return The vault data struct with current state information
     */
    function _getVaultData() internal view returns (DualTokenVaultData memory) {
        return
            DualTokenVaultData({
                vaultState: vaultState,
                startingStableTokenBalance: startingStableTokenBalance,
                startingVaultTokenBalance: startingVaultTokenBalance,
                issuerAddress: issuerAddress,
                creationTimestamp: creationTimestamp
            });
    }

    /**
     * @notice Converts a token amount from source to target using price and decimals
     * @dev Calculates the scaling factor based on decimals and applies price conversion
     * @param _sourceAmount The amount in source token units
     * @param _price The price to use for conversion
     * @param _sourceDecimals The decimals of the source token
     * @param _targetDecimals The decimals of the target token
     * @param _priceDecimals The decimals of the price
     * @return The converted amount in target token units
     */
    function _convertTokenAmount(
        uint256 _sourceAmount,
        uint256 _price,
        uint8 _sourceDecimals,
        uint8 _targetDecimals,
        uint8 _priceDecimals
    ) internal pure returns (uint256) {
        if (_sourceDecimals + _priceDecimals >= _targetDecimals) {
            uint256 scale = 10 ** (_sourceDecimals + _priceDecimals - _targetDecimals);
            return Math.mulDiv(_sourceAmount, _price, scale);
        } else {
            uint256 scale = 10 ** (_targetDecimals - _sourceDecimals - _priceDecimals);
            return _sourceAmount * _price * scale;
        }
    }

    /**
     * @notice Generates a Merkle tree leaf from an account address
     * @param _account The account address to generate a leaf for
     * @return The hashed leaf value
     */
    function _getLeaf(address _account) internal pure returns (bytes32) {
        return MerkleTreeHelper.leaf(_account);
    }

    /**
     * @notice Verifies a Merkle proof against a root and leaf
     * @param _merkleRoot The Merkle root to verify against
     * @param _leaf The leaf value to verify
     * @param _proof The Merkle proof array
     * @return True if the proof is valid, false otherwise
     */
    function _proofVerified(bytes32 _merkleRoot, bytes32 _leaf, bytes32[] memory _proof) internal pure returns (bool) {
        return MerkleProof.verify(_proof, _merkleRoot, _leaf);
    }

    /** @notice Checks that the token addresses in the provided pairs match each other
     * @param _tokenInPair0 The tokenIn address from the first pair (e.g., Liquidity Book)
     * @param _tokenOutPair0 The tokenOut address from the first pair
     * @param _tokenInPair1 The tokenIn address from the second pair (e.g., Blackhole)
     * @param _tokenOutPair1 The tokenOut address from the second pair
     * @param _wrappedNativeToken The address of the wrapped native token, used for comparison if any token is the zero address
     */
    function _checkTokenMatch(
        address _tokenInPair0,
        address _tokenOutPair0,
        address _tokenInPair1,
        address _tokenOutPair1,
        address _wrappedNativeToken
    ) internal pure {
        // if any of the tokens are address(0), use the wrapped native token address for comparison instead
        if (_tokenInPair0 == address(0)) {
            _tokenInPair0 = address(_wrappedNativeToken);
        }

        if (_tokenOutPair0 == address(0)) {
            _tokenOutPair0 = address(_wrappedNativeToken);
        }

        if (_tokenInPair1 == address(0)) {
            _tokenInPair1 = address(_wrappedNativeToken);
        }

        if (_tokenOutPair1 == address(0)) {
            _tokenOutPair1 = address(_wrappedNativeToken);
        }

        if (
            !((_tokenInPair0 == _tokenOutPair1 && _tokenOutPair0 == _tokenInPair1) ||
                (_tokenInPair0 == _tokenInPair1 && _tokenOutPair0 == _tokenOutPair1))
        ) {
            revert TokenAddressMismatch();
        }
    }
}

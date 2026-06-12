// SPDX-License-Identifier: MIT

pragma solidity 0.8.30;

import {AccessControlUpgradeable} from "@openzeppelin-upgradeable/contracts/access/AccessControlUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin-upgradeable/contracts/utils/ReentrancyGuardUpgradeable.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title PaymentSplitterUpgradeable
 * @author Drew Kerby
 * @notice Upgradeable contract for splitting payments among multiple payees according to predefined shares
 * @dev This contract distributes both ERC20 tokens and native currency to payees based on basis point shares.
 *      Shares are specified in basis points (BPS), where 10,000 BPS equals 100%. The last payee receives
 *      any remainder to account for rounding. Includes reentrancy protection and access control.
 */
contract PaymentSplitterUpgradeable is AccessControlUpgradeable, ReentrancyGuardUpgradeable {
    using SafeERC20 for IERC20;

    bytes32 public constant MODERATOR_ROLE = keccak256("MODERATOR_ROLE");
    uint256 constant BPS_DENOMINATOR = 10_000;

    uint256[] public shares;
    address[] public payees;

    event ERC20PaymentWithdrawn(address indexed payee, address indexed tokenAddress, uint256 amount);
    event NativePaymentWithdrawn(address indexed payee, uint256 amount);
    event PayeesAndSharesUpdated(address[] oldPayees, uint256[] oldShares, address[] newPayees, uint256[] newShares);

    error PayeeShareMismatch(uint256 payeesLength, uint256 sharesLength);
    error ZeroAddressPayee();
    error InvalidShareAmount(uint256 share);
    error InvalidTotalShares(uint256 totalShares);
    error NoBalanceToWithdraw();
    error TransferFailed();

    /**
     * @dev Locks the implementation contract by disabling initializers.
     * @notice Prevents direct initialization; use {initialize} via proxy instead.
     */
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Receives native tokens sent to the contract
     */
    receive() external payable {}

    /**
     * @notice Initializes the contract with payees and their respective shares
     * @param _payees Array of payee addresses
     * @param _shares Array of share amounts in basis points (must sum to 10,000)
     */
    function initialize(address[] memory _payees, uint256[] memory _shares) external initializer {
        __AccessControl_init();
        __ReentrancyGuard_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MODERATOR_ROLE, msg.sender);

        _setPayeesAndShares(_payees, _shares);
    }

    /**
     * @notice Withdraws ERC20 tokens and distributes them to payees according to their shares
     * @param _token The ERC20 token address to withdraw
     */
    function withdrawERC20(address _token) external nonReentrant {
        // get the ERC20 token balance of this contract
        uint256 balance = IERC20(_token).balanceOf(address(this));

        if (balance == 0) {
            revert NoBalanceToWithdraw();
        }

        uint256 remaining = balance;
        uint256 payeesLength = payees.length;
        for (uint256 i = 0; i < payeesLength; i++) {
            uint256 payment;

            if (i == payeesLength - 1) {
                // Last payee gets the remainder
                payment = remaining;
            } else {
                payment = (balance * shares[i]) / BPS_DENOMINATOR;
                remaining -= payment;
            }

            IERC20(_token).safeTransfer(payees[i], payment);

            emit ERC20PaymentWithdrawn(payees[i], _token, payment);
        }
    }

    /**
     * @notice Withdraws native tokens and distributes them to payees according to their shares
     */
    function withdrawNative() external nonReentrant {
        uint256 balance = address(this).balance;

        if (balance == 0) {
            revert NoBalanceToWithdraw();
        }

        uint256 remaining = balance;
        uint256 payeesLength = payees.length;
        for (uint256 i = 0; i < payeesLength; i++) {
            uint256 payment;

            if (i == payeesLength - 1) {
                // Last payee gets the remainder
                payment = remaining;
            } else {
                payment = (balance * shares[i]) / BPS_DENOMINATOR;
                remaining -= payment;
            }

            (bool success, ) = payees[i].call{value: payment}("");
            if (!success) {
                revert TransferFailed();
            }

            emit NativePaymentWithdrawn(payees[i], payment);
        }
    }

    /**
     * @notice Sets payees and their respective shares
     * @param _payees Array of payee addresses
     * @param _shares Array of share amounts in basis points (must sum to 10,000)
     */
    function setPayeesAndShares(address[] memory _payees, uint256[] memory _shares) external onlyRole(MODERATOR_ROLE) {
        address[] memory oldPayees = payees;
        uint256[] memory oldShares = shares;

        _setPayeesAndShares(_payees, _shares);

        emit PayeesAndSharesUpdated(oldPayees, oldShares, _payees, _shares);
    }

    /**
     * @notice Internal function to set payees and shares with validation
     * @param _payees Array of payee addresses
     * @param _shares Array of share amounts in basis points
     */
    function _setPayeesAndShares(address[] memory _payees, uint256[] memory _shares) internal {
        if (_payees.length != _shares.length) {
            revert PayeeShareMismatch({payeesLength: _payees.length, sharesLength: _shares.length});
        }

        uint256 totalShares = 0;

        for (uint256 i = 0; i < _payees.length; i++) {
            if (_payees[i] == address(0)) {
                revert ZeroAddressPayee();
            }

            if (_shares[i] == 0 || _shares[i] > BPS_DENOMINATOR) {
                revert InvalidShareAmount(_shares[i]);
            }

            totalShares += _shares[i];
        }

        if (totalShares != BPS_DENOMINATOR) {
            revert InvalidTotalShares(totalShares);
        }

        payees = _payees;
        shares = _shares;
    }
}

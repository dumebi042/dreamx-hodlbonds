// SPDX-License-Identifier: MIT

pragma solidity 0.8.30;

interface IPaymentSplitterEvents {
    event PaymentWithdrawn(address indexed payee, uint256 amount);
}

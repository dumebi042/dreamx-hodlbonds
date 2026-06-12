// SPDX-License-Identifier: MIT

pragma solidity 0.8.30;

enum DualTokenVaultState {
    BOND_ISSUANCE,
    TRADING,
    SETTLED
}

struct VaultTokenBalance {
    uint256 vaultTokenBalance;
    uint256 vaultTokenDecimals;
    uint256 stableTokenBalance;
    uint256 stableTokenDecimals;
}

struct DualTokenVaultData {
    DualTokenVaultState vaultState;
    uint256 startingStableTokenBalance;
    uint256 startingVaultTokenBalance;
    address issuerAddress;
    uint256 creationTimestamp;
}

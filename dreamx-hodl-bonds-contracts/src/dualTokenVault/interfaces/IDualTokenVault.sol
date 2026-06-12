// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.30;

import {VaultParameters} from "src/dualTokenVaultFactory/types/DualTokenVaultFactoryTypes.sol";
import {LiquidityBookSwapParameters} from "src/dex/lfj/types/LiquidityBookSwapTypes.sol";
import {BlackholeSwapParameters} from "src/dex/blackhole/types/BlackholeSwapTypes.sol";
import {DualTokenVaultData} from "src/dualTokenVault/types/DualTokenVaultTypes.sol";

interface IDualTokenVault {
    function initialize(
        VaultParameters memory _vaultParameters,
        LiquidityBookSwapParameters memory _lbSwapData,
        BlackholeSwapParameters memory _blackholeSwapData,
        address _wrappedNativeTokenAddress,
        address _factoryAddress
    ) external;

    function issueBond(address _purchaser) external returns (uint256, uint256, uint256);

    function getVaultConfig() external view returns (VaultParameters memory);

    function getVaultData() external view returns (DualTokenVaultData memory);

    function grantRole(bytes32 role, address account) external;

    function revokeRole(bytes32 role, address account) external;
}

// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.30;

interface IDualTokenVaultFactory {
    function getTraderMerkleRoot() external view returns (bytes32);
    function feeSplitterAddress() external view returns (address);
}

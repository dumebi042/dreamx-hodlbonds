// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.30;

interface IWNATIVE {
    function deposit() external payable;

    function withdraw(uint256 wad) external;

    function approve(address guy, uint256 wad) external returns (bool);

    function balanceOf(address guy) external view returns (uint256);
}

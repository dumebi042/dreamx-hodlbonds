// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Script} from "forge-std/Script.sol";
import {VaultReceiptToken} from "src/vaultReceiptToken/VaultReceiptToken.sol";
import {console} from "forge-std/console.sol";

// op run -- forge script script/DeployVaultReceiptToken.s.sol:DeployVaultReceiptToken --rpc-url avalanche-fuji --broadcast -vvvv
contract DeployVaultReceiptToken is Script {
    function setUp() public {}

    function run() public {
        uint256 deployerPrivateKey = vm.envUint("DREAMX_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        console.log("Deployer address:", deployer);
        vm.startBroadcast(deployerPrivateKey);

        VaultReceiptToken vaultToken = new VaultReceiptToken();
        console.log("VaultReceiptToken deployed at:", address(vaultToken));

        vm.stopBroadcast();
    }
}

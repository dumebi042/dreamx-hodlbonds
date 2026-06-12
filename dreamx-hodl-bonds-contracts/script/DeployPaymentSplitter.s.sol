// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Script} from "forge-std/Script.sol";
import {PaymentSplitterUpgradeable} from "src/paymentSplitter/PaymentSplitterUpgradeable.sol";
import {Upgrades} from "lib/openzeppelin-foundry-upgrades/src/Upgrades.sol";
import {console} from "forge-std/console.sol";

// op run -- forge script script/DeployPaymentSplitter.s.sol:DeployPaymentSplitter --rpc-url avalanche-fuji --broadcast -vvvv
contract DeployPaymentSplitter is Script {
    function run() external returns (address, address) {
        //we need to declare the sender's private key here to sign the deploy transaction
        uint256 deployerPrivateKey = vm.envUint("DREAMX_PRIVATE_KEY");
        // log out the deployer address
        address deployer = vm.addr(deployerPrivateKey);
        console.log("Deployer address:", deployer);
        vm.startBroadcast(deployerPrivateKey);

        address[] memory payees = new address[](1);
        uint256[] memory shares = new uint256[](1);
        payees[0] = msg.sender;
        shares[0] = 10000;

        // Deploy the upgradeable contract
        address proxyAddress = Upgrades.deployTransparentProxy(
            "PaymentSplitterUpgradeable.sol",
            deployer,
            abi.encodeCall(PaymentSplitterUpgradeable.initialize, (payees, shares))
        );

        // Get the implementation address
        address implementationAddress = Upgrades.getImplementationAddress(proxyAddress);

        console.log("PaymentSplitterUpgradeable Proxy", proxyAddress);
        console.log("PaymentSplitterUpgradeable Implementation:", implementationAddress);

        vm.stopBroadcast();

        return (implementationAddress, proxyAddress);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Script} from "forge-std/Script.sol";

import {console} from "forge-std/console.sol";
import {Contracts} from "script/Contracts.s.sol";
import {DualTokenVaultFactory} from "src/dualTokenVaultFactory/DualTokenVaultFactory.sol";
import {ApprovedTokenSet} from "src/marketplace/types/MarketplaceTypes.sol";
import {BondMarketplace} from "src/marketplace/BondMarketplace.sol";
import {DualTokenVaultFactory} from "src/dualTokenVaultFactory/DualTokenVaultFactory.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";

// op run -- forge script script/DeployMarketplace.s.sol:DeployMarketplace --rpc-url avalanche-fuji --broadcast -vvvv
contract DeployMarketplace is Script {
    function run() external returns (address) {
        //we need to declare the sender's private key here to sign the deploy transaction
        uint256 deployerPrivateKey = vm.envUint("DREAMX_PRIVATE_KEY");
        // log out the deployer address
        address deployer = vm.addr(deployerPrivateKey);
        console.log("Deployer address:", deployer);

        uint256[] memory approvedTokenSetIds = new uint256[](1);
        ApprovedTokenSet[] memory approvedTokenSets = new ApprovedTokenSet[](1);
        DualTokenVaultFactory vaultFactory = DualTokenVaultFactory(Contracts.getVaultFactoryAddress(block.chainid));

        approvedTokenSetIds[0] = 1;
        approvedTokenSets[0] = (
            ApprovedTokenSet({
                erc1155Address: vaultFactory.receiptTokenAddress(),
                tradeToken: Currency.wrap(Contracts.getNativeTokenAddress(block.chainid))
            })
        );

        vm.startBroadcast(deployerPrivateKey);
        // deploy the bond marketplace
        BondMarketplace bondMarketplace = new BondMarketplace(
            approvedTokenSetIds,
            approvedTokenSets,
            address(Contracts.getPaymentSplitterAddress(block.chainid)),
            250 // 2.5% fee
        );
        vm.stopBroadcast();

        console.log("Bond Marketplace deployed at:", address(bondMarketplace));

        return (address(bondMarketplace));
    }
}

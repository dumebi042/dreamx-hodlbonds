// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script} from "forge-std/Script.sol";

import {console} from "forge-std/console.sol";
import {Contracts} from "script/Contracts.s.sol";
import {DualTokenVaultFactory} from "src/dualTokenVaultFactory/DualTokenVaultFactory.sol";
import {MerkleTreeHelper} from "src/lib/MerkleTreeHelper.sol";
import {MerkleTreeTestHelper} from "test/util/MerkleTreeTestHelper.sol";

// op run -- forge script script/UpdateVaultFactoryMerkleRoot.s.sol:UpdateVaultFactoryMerkleRoot --rpc-url avalanche-fuji --broadcast -vvvv
contract UpdateVaultFactoryMerkleRoot is Script {
    function run() external {
        //we need to declare the sender's private key here to sign the deploy transaction
        uint256 deployerPrivateKey = vm.envUint("DREAMX_PRIVATE_KEY");
        // log out the deployer address
        address deployer = vm.addr(deployerPrivateKey);
        console.log("Deployer address:", deployer);

        // build the merkle tree from the list of trader addresses
        address[] memory traders = new address[](2);
        traders[0] = 0x5f6c48322Ea971283510080AAda379be79254aF6;
        traders[1] = 0xc41D567250019f3Ea18691f378446625b1d45c87;

        bytes32[] memory leaves = new bytes32[](traders.length);
        for (uint256 i = 0; i < traders.length; i++) {
            console.log("Trader address:", traders[i]);
            leaves[i] = MerkleTreeHelper.leaf(traders[i]);
        }

        bytes32 merkleRoot = MerkleTreeTestHelper.buildRoot(leaves);

        DualTokenVaultFactory vaultFactory = DualTokenVaultFactory(Contracts.getVaultFactoryAddress(block.chainid));

        vm.startBroadcast(deployerPrivateKey);
        vaultFactory.setTraderMerkleRoot(merkleRoot);
        console.logBytes32(merkleRoot);
        vm.stopBroadcast();
    }
}

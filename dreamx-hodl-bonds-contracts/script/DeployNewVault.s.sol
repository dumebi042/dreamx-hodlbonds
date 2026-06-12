// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Script} from "forge-std/Script.sol";

import {console} from "forge-std/console.sol";
import {DualTokenVaultFactory} from "src/dualTokenVaultFactory/DualTokenVaultFactory.sol";
import {
    VaultParameters,
    Dex,
    UserConfigurableVaultParameters
} from "src/dualTokenVaultFactory/types/DualTokenVaultFactoryTypes.sol";
import {DualTokenVault} from "src/dualTokenVault/DualTokenVault.sol";
import {Contracts} from "./Contracts.s.sol";
import {UnlimitedMintERC20} from "test/mocks/UnlimitedMintERC20.sol";

// op run -- forge script script/DeployNewVault.s.sol:DeployNewVault --rpc-url avalanche-fuji --broadcast -vvvv
contract DeployNewVault is Script {
    function run() external {
        //we need to declare the sender's private key here to sign the deploy transaction
        uint256 deployerPrivateKey = vm.envUint("DREAMX_PRIVATE_KEY");
        // log out the deployer address
        address deployer = vm.addr(deployerPrivateKey);
        console.log("Deployer address:", deployer);

        UnlimitedMintERC20 stableToken = UnlimitedMintERC20(Contracts.getUSDCAddress(block.chainid));
        // mint some stable tokens to the deployer for testing
        vm.startBroadcast(deployerPrivateKey);
        stableToken.mint(deployer, 1_000_000 * 1e18);
        console.log("Stable tokens minted to deployer:", deployer);
        stableToken.approve(Contracts.getVaultFactoryAddress(block.chainid), type(uint256).max);
        vm.stopBroadcast();

        UnlimitedMintERC20 btcToken = UnlimitedMintERC20(Contracts.getBTCAddress(block.chainid));
        // mint some BTC to the deployer for testing
        vm.startBroadcast(deployerPrivateKey);
        btcToken.mint(deployer, 10_000 * 1e8);
        console.log("BTC minted to deployer:", deployer);
        btcToken.approve(Contracts.getVaultFactoryAddress(block.chainid), type(uint256).max);
        vm.stopBroadcast();

        DualTokenVaultFactory vaultFactory = DualTokenVaultFactory(Contracts.getVaultFactoryAddress(block.chainid));
        vm.startBroadcast(deployerPrivateKey);
        vaultFactory.setMinUSDPricePerBond(1);

        uint256 bondPrice = 0.0001 ether;

        // need to send the variable token as the msg.value
        address deployedAddress = vaultFactory.createVaultAndIssueBond{value: (bondPrice * 102) / 100}(
            UserConfigurableVaultParameters({
                bondPrice: bondPrice,
                maxStableTokenAmount: 1_000_000 ether,
                reserveRatio: 2000,
                tradingPeriodDuration: 96 days,
                pairId: 1,
                primaryDex: Dex.LFJ
            })
        );
        console.log("Deployed native/USDC vault address:", deployedAddress);

        VaultParameters memory config = DualTokenVault(payable(deployedAddress)).getVaultConfig();
        uint256 vaultId = config.vaultId;
        console.log("Native Vault ID:", vaultId);
        vm.stopBroadcast();

        vm.startBroadcast(deployerPrivateKey);
        deployedAddress = vaultFactory.createVaultAndIssueBond(
            UserConfigurableVaultParameters({
                bondPrice: bondPrice,
                maxStableTokenAmount: 1_000_000 ether,
                reserveRatio: 2000,
                tradingPeriodDuration: 96 days,
                pairId: 2,
                primaryDex: Dex.LFJ
            })
        );
        console.log("Deployed BTC/USDC multi-hop vault address:", deployedAddress);

        config = DualTokenVault(payable(deployedAddress)).getVaultConfig();
        vaultId = config.vaultId;
        console.log("BTC Vault ID:", vaultId);
        vm.stopBroadcast();
    }
}

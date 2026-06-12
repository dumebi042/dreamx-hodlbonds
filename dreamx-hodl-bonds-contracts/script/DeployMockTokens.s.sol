// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {UnlimitedMintERC20} from "test/mocks/UnlimitedMintERC20.sol";

// op run -- forge script script/DeployMockTokens.s.sol:DeployMockTokens --rpc-url avalanche-fuji --broadcast -vvvv
contract DeployMockTokens is Script {
    function setUp() public {}

    function run() public {
        //we need to declare the sender's private key here to sign the deploy transaction
        uint256 deployerPrivateKey = vm.envUint("DREAMX_PRIVATE_KEY");
        // log out the deployer address
        address deployer = vm.addr(deployerPrivateKey);
        console.log("Deployer address:", deployer);

        vm.startBroadcast(deployerPrivateKey);

        UnlimitedMintERC20 usdc = new UnlimitedMintERC20("USDC", "USDC", 6, 1000000 * 10 ** 6);
        console.log("Mock USDC deployed at:", address(usdc));

        UnlimitedMintERC20 weth = new UnlimitedMintERC20("WETH.e", "WETH.e", 18, 1000000 ether);
        console.log("Mock WETH.e deployed at:", address(weth));

        UnlimitedMintERC20 wbtc = new UnlimitedMintERC20("BTC.b", "BTC.b", 8, 1000000 ether);
        console.log("Mock BTC.b deployed at:", address(wbtc));

        vm.stopBroadcast();
    }
}

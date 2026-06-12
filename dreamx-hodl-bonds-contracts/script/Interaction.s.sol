// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {Contracts} from "script/Contracts.s.sol";
import {AggregatorV3Interface} from "src/oracles/chainlink/interfaces/AggregatorV3Interface.sol";

// op run -- forge script script/Interaction.s.sol:Interaction --rpc-url avalanche-fuji --broadcast -vvvv
contract Interaction is Script {
    function run() external {
        //we need to declare the sender's private key here to sign the deploy transaction
        uint256 deployerPrivateKey = vm.envUint("DREAMX_PRIVATE_KEY");
        // log out the deployer address
        address deployer = vm.addr(deployerPrivateKey);
        console.log("Deployer address:", deployer);
        vm.startBroadcast(deployerPrivateKey);

        address chainlinkOracle = Contracts.get_AVAX_USDC_ChainLinkPriceOracleAddress(block.chainid);
        console.log("Chainlink Oracle Address:", chainlinkOracle);

        (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        ) = AggregatorV3Interface(chainlinkOracle).latestRoundData();
        console.log("Latest Round ID:", roundId);
        console.log("Latest Answer:", answer);
        console.log("Started At:", startedAt);
        console.log("Updated At:", updatedAt);
        console.log("Answered In Round:", answeredInRound);

        // get the decimals
        uint8 decimals = AggregatorV3Interface(chainlinkOracle).decimals();
        console.log("Decimals:", decimals);

        vm.stopBroadcast();
    }
}

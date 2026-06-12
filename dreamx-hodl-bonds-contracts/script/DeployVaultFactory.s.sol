// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Script} from "forge-std/Script.sol";

import {console} from "forge-std/console.sol";
import {Contracts} from "script/Contracts.s.sol";
import {DualTokenVaultFactory} from "src/dualTokenVaultFactory/DualTokenVaultFactory.sol";
import {DualTokenVault} from "src/dualTokenVault/DualTokenVault.sol";
import {ApprovedPair} from "src/dualTokenVaultFactory/types/DualTokenVaultFactoryTypes.sol";
import {MerkleTreeHelper} from "src/lib/MerkleTreeHelper.sol";
import {MerkleTreeTestHelper} from "test/util/MerkleTreeTestHelper.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ILBPair} from "src/dex/lfj/interfaces/ILBPair.sol";
import {Version} from "src/dex/lfj/types/ILBRouterTypes.sol";
import {Path} from "src/dualTokenVaultFactory/types/DualTokenVaultFactoryTypes.sol";
import {Route} from "src/dualTokenVaultFactory/types/DualTokenVaultFactoryTypes.sol";

// op run -- forge script script/DeployVaultFactory.s.sol:DeployVaultFactory --rpc-url avalanche-fuji --broadcast -vvvv
contract DeployVaultFactory is Script {
    function run() external returns (address) {
        //we need to declare the sender's private key here to sign the deploy transaction
        uint256 deployerPrivateKey = vm.envUint("DREAMX_PRIVATE_KEY");
        // log out the deployer address
        address deployer = vm.addr(deployerPrivateKey);
        console.log("Deployer address:", deployer);

        // Deploy the DualTokenVault implementation contract
        vm.startBroadcast(deployerPrivateKey);
        DualTokenVault vaultImplementation = new DualTokenVault();
        vm.stopBroadcast();

        address bitcoinTokenAddress = Contracts.getBTCAddress(block.chainid);
        address wrappedNativeTokenAddress = Contracts.getWrappedNativeTokenAddress(block.chainid);
        address stableTokenAddress = Contracts.getUSDCAddress(block.chainid);
        address lbStableTokenPairAddress = Contracts.getLB_AVAX_USDC_Address(block.chainid);
        address lbBitcoinTokenPairAddress = Contracts.getLB_BTC_USDC_Address(block.chainid);
        address blackholeTokenPairAddress = Contracts.getBlackhole_AVAX_USDC_Address(block.chainid);

        // Approved Pair 1 - direct swap
        uint256[] memory pairBinSteps = new uint256[](1);
        pairBinSteps[0] = uint256(ILBPair(lbStableTokenPairAddress).getBinStep());

        // Approved Pair 2 - multihop
        IERC20[] memory tokenPath1 = new IERC20[](3);

        tokenPath1[0] = IERC20(bitcoinTokenAddress); // input token
        tokenPath1[1] = IERC20(wrappedNativeTokenAddress);
        tokenPath1[2] = IERC20(stableTokenAddress); // output token

        uint256[] memory pairBinSteps1 = new uint256[](2);
        pairBinSteps1[0] = uint256(ILBPair(lbBitcoinTokenPairAddress).getBinStep());
        pairBinSteps1[1] = uint256(ILBPair(lbStableTokenPairAddress).getBinStep());

        Version[] memory versions1 = new Version[](1);
        versions1[0] = Contracts.getLBVersion(block.chainid); // add the version of the pair to perform the swap on

        Path memory path1; // instantiate and populate the path to perform the swap.
        path1.pairBinSteps = pairBinSteps1;
        path1.versions = versions1;
        path1.tokenPath = tokenPath1;

        Route[] memory routes1 = new Route[](2);
        routes1[0] = Route({
            pair: address(blackholeTokenPairAddress),
            from: address(bitcoinTokenAddress),
            to: address(wrappedNativeTokenAddress),
            stable: false,
            concentrated: true,
            receiver: address(blackholeTokenPairAddress) // need to set the receiver to the pair address for the intermediate swap
        });

        routes1[1] = Route({
            pair: address(blackholeTokenPairAddress),
            from: address(wrappedNativeTokenAddress),
            to: address(stableTokenAddress),
            stable: false,
            concentrated: true,
            receiver: address(0) // the final receiver will be set to the correct value in the swap function of the vault
        });

        ApprovedPair memory approvedPair1 = ApprovedPair({
            stableTokenAddress: Contracts.getUSDCAddress(block.chainid),
            vaultTokenAddress: bitcoinTokenAddress,
            wrappedNativeTokenAddress: address(0),
            routerAddress: Contracts.getLBRouterV22(block.chainid),
            swapPath: path1,
            routerV2Address: Contracts.getBlackholeRouterV2Address(block.chainid),
            swapRoutes: routes1,
            chainlinkPriceOracleAddress: Contracts.get_BTC_USDC_ChainLinkPriceOracleAddress(block.chainid),
            maxPriceAge: 21_600
        });

        uint256[] memory pairIds = new uint256[](2);
        pairIds[0] = 1;
        pairIds[1] = 2;
        ApprovedPair[] memory approvedPairs = new ApprovedPair[](pairIds.length);
        approvedPairs[0] = Contracts.get_Native_USDC_Pair(block.chainid, pairBinSteps);
        approvedPairs[1] = approvedPair1;

        // build a merkle tree for testing
        address[] memory traders = new address[](2);
        traders[0] = 0x5f6c48322Ea971283510080AAda379be79254aF6;
        traders[1] = 0xc41D567250019f3Ea18691f378446625b1d45c87;

        bytes32[] memory leaves = new bytes32[](traders.length);
        for (uint256 i = 0; i < traders.length; i++) {
            console.log("Trader address:", traders[i]);
            leaves[i] = MerkleTreeHelper.leaf(traders[i]);
        }

        bytes32 merkleRoot = MerkleTreeTestHelper.buildRoot(leaves);
        console.log("Merkle Root:");
        console.logBytes32(merkleRoot);

        // Deploy the factory contract
        vm.startBroadcast(deployerPrivateKey);
        DualTokenVaultFactory vaultFactory = new DualTokenVaultFactory(
            address(vaultImplementation),
            Contracts.getPaymentSplitterAddress(block.chainid),
            1 ether,
            200, // 2% management fee
            2000, // 20% performance fee
            "", // dummy URI
            merkleRoot,
            pairIds,
            approvedPairs
        );
        console.log("VaultFactory contract Deployed at:", address(vaultFactory));
        vm.stopBroadcast();

        return (address(vaultFactory));
    }
}

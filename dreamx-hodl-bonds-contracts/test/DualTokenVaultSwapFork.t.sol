// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {DualTokenVaultFactory} from "src/dualTokenVaultFactory/DualTokenVaultFactory.sol";
import {DualTokenVault} from "src/dualTokenVault/DualTokenVault.sol";
import {
    UserConfigurableVaultParameters,
    ApprovedPair,
    Path,
    Route,
    Dex
} from "src/dualTokenVaultFactory/types/DualTokenVaultFactoryTypes.sol";
import {ILBPair} from "src/dex/lfj/interfaces/ILBPair.sol";
import {Version} from "src/dex/lfj/types/ILBRouterTypes.sol";
import {MerkleTreeHelper} from "src/lib/MerkleTreeHelper.sol";
import {MerkleTreeTestHelper} from "test/util/MerkleTreeTestHelper.sol";
import {Contracts} from "script/Contracts.s.sol";

contract DualTokenVaultSwapForkTest is Test {
    uint256 fork;

    IERC20 USDC;
    IERC20 BTC;
    IERC20 WAVAX;

    address LB_ROUTER;
    address LB_PAIR;
    address BLACKHOLE_ROUTER;
    address BLACKHOLE_WAVAX_USDC_PAIR;
    address BLACKHOLE_BTC_WAVAX_PAIR;
    address BLACKHOLE_BTC_USDC_PAIR;
    address AVAX_USD;

    address user = address(0xBEEF);
    address trader2 = makeAddr("trader2");
    address trader3 = makeAddr("trader3");

    DualTokenVaultFactory vaultFactory;
    DualTokenVault implementation;

    bytes32 public merkleRoot;
    bytes32[] public merkleProof;

    function setUp() public {
        fork = vm.createFork(vm.rpcUrl("avalanche-mainnet"));
        vm.selectFork(fork);

        implementation = new DualTokenVault();

        USDC = IERC20(Contracts.getUSDCAddress(block.chainid));
        BTC = IERC20(Contracts.getBTCAddress(block.chainid));
        WAVAX = IERC20(Contracts.getWrappedNativeTokenAddress(block.chainid));
        LB_ROUTER = Contracts.getLBRouterV22(block.chainid);
        LB_PAIR = Contracts.getLB_AVAX_USDC_Address(block.chainid);
        BLACKHOLE_ROUTER = Contracts.getBlackholeRouterV2Address(block.chainid);
        BLACKHOLE_WAVAX_USDC_PAIR = 0xA02Ec3Ba8d17887567672b2CDCAF525534636Ea0;
        BLACKHOLE_BTC_WAVAX_PAIR = 0x8FEF4fE4970a5D6bFa7C65871a2EbFD0F42aa822;
        BLACKHOLE_BTC_USDC_PAIR = 0x23fF0B5370BF33725918e6105108f3fa2c4b8a05;
        AVAX_USD = 0x0A77230d17318075983913bC2145DB16C7366156;

        vm.deal(user, 10_000 ether);
        deal(address(USDC), user, 10_000e6);

        // build a merkle tree for testing
        address[] memory traders = new address[](3);
        traders[0] = user;
        traders[1] = trader2;
        traders[2] = trader3;
        bytes32[] memory leaves = new bytes32[](traders.length);
        leaves[0] = MerkleTreeHelper.leaf(user);
        leaves[1] = MerkleTreeHelper.leaf(trader2);
        leaves[2] = MerkleTreeHelper.leaf(trader3);
        merkleRoot = MerkleTreeTestHelper.buildRoot(leaves);
        merkleProof = MerkleTreeTestHelper.buildProof(leaves, 0);

        _deployFactory();
    }

    function _deployFactory() internal {
        // --- tokenPath ---
        IERC20[] memory tokenPath = new IERC20[](2);
        tokenPath[0] = WAVAX;
        tokenPath[1] = USDC;

        // --- binSteps ---
        uint256[] memory binSteps = new uint256[](1);
        binSteps[0] = ILBPair(LB_PAIR).getBinStep();

        // --- versions ---
        Version[] memory versions = new Version[](1);
        versions[0] = Version.V2_2;

        // --- path ---
        Path memory path = Path({pairBinSteps: binSteps, versions: versions, tokenPath: tokenPath});

        // --- routes ---
        Route[] memory singleHopRoute = new Route[](1);
        singleHopRoute[0] = Route({
            pair: BLACKHOLE_WAVAX_USDC_PAIR,
            from: address(WAVAX),
            to: address(USDC),
            stable: false,
            concentrated: true,
            receiver: address(0)
        });

        Route[] memory multiHopRoute = new Route[](2);
        multiHopRoute[0] = Route({
            pair: BLACKHOLE_BTC_WAVAX_PAIR,
            from: address(WAVAX),
            to: address(BTC),
            stable: false,
            concentrated: true,
            receiver: address(BLACKHOLE_ROUTER)
        });
        multiHopRoute[1] = Route({
            pair: BLACKHOLE_BTC_USDC_PAIR,
            from: address(BTC),
            to: address(USDC),
            stable: false,
            concentrated: true,
            receiver: address(0)
        });

        // --- approved pairs ---
        ApprovedPair memory singleHopPair = ApprovedPair({
            stableTokenAddress: address(USDC),
            vaultTokenAddress: address(0),
            wrappedNativeTokenAddress: address(WAVAX),
            routerAddress: LB_ROUTER,
            swapPath: path,
            routerV2Address: BLACKHOLE_ROUTER,
            swapRoutes: singleHopRoute,
            chainlinkPriceOracleAddress: AVAX_USD,
            maxPriceAge: 1 hours
        });

        ApprovedPair memory multiHopPair = ApprovedPair({
            stableTokenAddress: address(USDC),
            vaultTokenAddress: address(0),
            wrappedNativeTokenAddress: address(WAVAX),
            routerAddress: LB_ROUTER,
            swapPath: path,
            routerV2Address: BLACKHOLE_ROUTER,
            swapRoutes: multiHopRoute,
            chainlinkPriceOracleAddress: AVAX_USD,
            maxPriceAge: 1 hours
        });

        // --- pairIds ---
        uint256[] memory pairIds = new uint256[](2);
        pairIds[0] = 1;
        pairIds[1] = 2;

        // --- pairs array ---
        ApprovedPair[] memory pairs = new ApprovedPair[](2);
        pairs[0] = singleHopPair;
        pairs[1] = multiHopPair;

        // --- deploy factory ---
        vaultFactory = new DualTokenVaultFactory(
            address(implementation),
            address(0x1234),
            100e6,
            200,
            2000,
            "",
            merkleRoot,
            pairIds,
            pairs
        );
    }

    function test_Fork_LBSwap() public {
        vm.startPrank(user);

        IERC20(USDC).approve(address(vaultFactory), type(uint256).max);

        uint256 bondPrice = 1000 ether;

        uint256 value = (bondPrice * (10_000 + vaultFactory.managementFee())) / 10_000;

        address vaultAddr = vaultFactory.createVaultAndIssueBond{value: value}(
            UserConfigurableVaultParameters({
                bondPrice: bondPrice,
                maxStableTokenAmount: 10_000e6,
                reserveRatio: 2000,
                tradingPeriodDuration: 96 days,
                pairId: 1,
                primaryDex: Dex.LFJ
            })
        );

        vm.stopPrank();

        DualTokenVault vault = DualTokenVault(payable(vaultAddr));

        // --- EXECUTE FORWARD SWAP ---

        vm.startPrank(user);

        uint256 beforeBalance = USDC.balanceOf(address(vault));

        vault.lbSwapExactInputSingle(
            1 ether, // amountIn
            1, // minOut
            address(0), // tokenIn
            block.timestamp + 1 hours, // deadline
            merkleProof
        );

        vm.stopPrank();

        uint256 afterBalance = USDC.balanceOf(address(vault));

        // ✅ ASSERT SWAP HAPPENED
        assertGt(afterBalance, beforeBalance);

        // --- EXECUTE REVERSE SWAP ---

        vm.startPrank(user);

        beforeBalance = USDC.balanceOf(address(vault));

        vault.lbSwapExactInputSingle(
            100e6, // amountIn
            1, // minOut
            address(USDC), // tokenIn
            block.timestamp + 1 hours, // deadline
            merkleProof
        );

        vm.stopPrank();

        afterBalance = USDC.balanceOf(address(vault));

        // ✅ ASSERT SWAP HAPPENED
        assertLt(afterBalance, beforeBalance);
    }

    function test_Fork_BlackholeSwap_SingleHop() public {
        vm.startPrank(user);

        IERC20(USDC).approve(address(vaultFactory), type(uint256).max);

        uint256 bondPrice = 1000 ether;

        uint256 value = (bondPrice * (10_000 + vaultFactory.managementFee())) / 10_000;

        // create a vault with the single hop route (AVAX -> USDC) - PairId 1
        address vaultAddr = vaultFactory.createVaultAndIssueBond{value: value}(
            UserConfigurableVaultParameters({
                bondPrice: bondPrice,
                maxStableTokenAmount: 10_000e6,
                reserveRatio: 2000,
                tradingPeriodDuration: 96 days,
                pairId: 1,
                primaryDex: Dex.BLACKHOLE
            })
        );

        vm.stopPrank();

        DualTokenVault vault = DualTokenVault(payable(vaultAddr));

        // --- EXECUTE FORWARD SWAP ---

        vm.startPrank(user);

        uint256 beforeBalance = USDC.balanceOf(address(vault));

        vault.blackholeSwapExactInputSingle(
            100 ether, // amountIn
            1, // minOut
            address(0), // tokenIn
            block.timestamp + 1 hours, // deadline
            merkleProof
        );

        vm.stopPrank();

        uint256 afterBalance = USDC.balanceOf(address(vault));

        // ✅ ASSERT SWAP HAPPENED
        assertGt(afterBalance, beforeBalance);

        // --- EXECUTE REVERSE SWAP ---
        vm.startPrank(user);

        beforeBalance = USDC.balanceOf(address(vault));

        vault.blackholeSwapExactInputSingle(
            100e6, // amountIn
            1, // minOut
            address(USDC), // tokenIn
            block.timestamp + 1 hours, // deadline
            merkleProof
        );

        vm.stopPrank();

        afterBalance = USDC.balanceOf(address(vault));

        // ✅ ASSERT SWAP HAPPENED
        assertLt(afterBalance, beforeBalance);
    }

    function test_Fork_BlackholeSwap_MultiHop() public {
        vm.startPrank(user);

        IERC20(USDC).approve(address(vaultFactory), type(uint256).max);

        uint256 bondPrice = 1000 ether;

        uint256 value = (bondPrice * (10_000 + vaultFactory.managementFee())) / 10_000;

        // PairId 2 corresponds to the multi-hop route in the setUp function
        address vaultAddr = vaultFactory.createVaultAndIssueBond{value: value}(
            UserConfigurableVaultParameters({
                bondPrice: bondPrice,
                maxStableTokenAmount: 10_000e6,
                reserveRatio: 2000,
                tradingPeriodDuration: 96 days,
                pairId: 2,
                primaryDex: Dex.BLACKHOLE
            })
        );

        vm.stopPrank();

        DualTokenVault vault = DualTokenVault(payable(vaultAddr));

        // --- EXECUTE FORWARD SWAP ---

        vm.startPrank(user);

        uint256 beforeBalance = USDC.balanceOf(address(vault));

        vault.blackholeSwapExactInputSingle(
            100 ether, // amountIn
            1, // minOut
            address(0), // tokenIn
            block.timestamp + 1 hours, // deadline
            merkleProof
        );

        vm.stopPrank();

        uint256 afterBalance = USDC.balanceOf(address(vault));

        // ✅ ASSERT SWAP HAPPENED
        assertGt(afterBalance, beforeBalance);

        // --- EXECUTE REVERSE SWAP ---
        vm.startPrank(user);

        beforeBalance = USDC.balanceOf(address(vault));

        vault.blackholeSwapExactInputSingle(
            100e6, // amountIn
            1, // minOut
            address(USDC), // tokenIn
            block.timestamp + 1 hours, // deadline
            merkleProof
        );

        vm.stopPrank();

        afterBalance = USDC.balanceOf(address(vault));

        // ✅ ASSERT SWAP HAPPENED
        assertLt(afterBalance, beforeBalance);
    }
}

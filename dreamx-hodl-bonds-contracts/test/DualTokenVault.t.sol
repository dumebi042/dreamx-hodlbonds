// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {IERC1155Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {
    VaultParameters,
    Dex,
    UserConfigurableVaultParameters,
    ApprovedPair,
    VaultCreationDataWithId
} from "src/dualTokenVaultFactory/types/DualTokenVaultFactoryTypes.sol";
import {VaultReceiptToken} from "src/vaultReceiptToken/VaultReceiptToken.sol";
import {DualTokenVaultFactory} from "src/dualTokenVaultFactory/DualTokenVaultFactory.sol";
import {VaultCreationDataWithId} from "src/dualTokenVaultFactory/types/DualTokenVaultFactoryTypes.sol";
import {DualTokenVault} from "src/dualTokenVault/DualTokenVault.sol";
import {IDualTokenVaultEvents} from "src/dualTokenVault/interfaces/IDualTokenVaultEvents.sol";
import {IDualTokenVaultFactoryEvents} from "src/dualTokenVaultFactory/interfaces/IDualTokenVaultFactoryEvents.sol";
import {UnlimitedMintERC20} from "test/mocks/UnlimitedMintERC20.sol";
import {LBPairMock} from "test/mocks/LBPairMock.sol";
import {AggregatorV3Mock} from "test/mocks/AggregatorV3Mock.sol";
import {Version} from "src/dex/lfj/types/ILBRouterTypes.sol";
import {PaymentSplitterUpgradeable} from "src/paymentSplitter/PaymentSplitterUpgradeable.sol";
import {MerkleTreeHelper} from "src/lib/MerkleTreeHelper.sol";
import {MerkleTreeTestHelper} from "test/util/MerkleTreeTestHelper.sol";
import {LBRouterMock} from "test/mocks/LBRouterMock.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ILBPair} from "src/dex/lfj/interfaces/ILBPair.sol";
import {Path} from "src/dualTokenVaultFactory/types/DualTokenVaultFactoryTypes.sol";
import {Route} from "src/dualTokenVaultFactory/types/DualTokenVaultFactoryTypes.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

contract DualTokenVaultTest is Test {
    using MerkleTreeHelper for bytes32[];

    uint256 constant BPS_DENOMINATOR = 10_000;
    uint256 constant NATIVE_TO_USD_RATE = 10; // 1 native token = $10

    PaymentSplitterUpgradeable public paymentSplitter;
    UnlimitedMintERC20 public stableToken;
    UnlimitedMintERC20 public wBTC;
    UnlimitedMintERC20 public wrappedNativeToken;
    DualTokenVault public vaultImplementation;
    DualTokenVaultFactory public vaultFactory;
    LBPairMock public nativeLBTokenPairMock;
    LBPairMock public wBTCLBTokenPairMock;
    LBRouterMock public lbRouterMock;
    AggregatorV3Mock public chainlinkPriceOracleMock;

    bytes32 public merkleRoot;
    bytes32[] public merkleProof;

    bytes32 public invalidMerkleRoot;
    bytes32[] public invalidMerkleProof;

    address team = makeAddr("team");
    address partner = makeAddr("partner");
    address trader1 = makeAddr("trader1");
    address trader2 = makeAddr("trader2");
    address trader3 = makeAddr("trader3");

    address invalidTrader1 = makeAddr("invalidTrader1");
    address invalidTrader2 = makeAddr("invalidTrader2");
    address invalidTrader3 = makeAddr("invalidTrader3");

    address beef = address(0xBEEF);
    address bob = address(0xB0B);

    function setUp() public {
        // deploy the stable token
        stableToken = new UnlimitedMintERC20("Test", "TEST", 6, 1_000_000 ether);

        // deploy the wBTC token
        wBTC = new UnlimitedMintERC20("Wrapped BTC", "WBTC", 18, 1_000_000 ether);

        // deploy the wrapped native token
        wrappedNativeToken = new UnlimitedMintERC20("Wrapped Native", "WNATIVE", 18, 1_000_000 ether);

        // deploy the vault implementation
        vaultImplementation = new DualTokenVault();

        // deploy the native liquidity book pair mock
        nativeLBTokenPairMock = new LBPairMock(address(stableToken), address(wrappedNativeToken));

        // deploy the wBTC liquidity book pair mock
        wBTCLBTokenPairMock = new LBPairMock(address(stableToken), address(wBTC));

        // deploy the lb router mock
        lbRouterMock = new LBRouterMock(address(wrappedNativeToken));

        // deploy the chainlink price oracle mock
        chainlinkPriceOracleMock = new AggregatorV3Mock(block.timestamp);

        address[] memory payees = new address[](2);
        uint256[] memory shares = new uint256[](2);
        payees[0] = team;
        shares[0] = BPS_DENOMINATOR / 2; // 50%
        payees[1] = partner;
        shares[1] = BPS_DENOMINATOR / 2; // 50%

        PaymentSplitterUpgradeable impl = new PaymentSplitterUpgradeable();

        ERC1967Proxy proxy = new ERC1967Proxy(
            address(impl),
            abi.encodeCall(PaymentSplitterUpgradeable.initialize, (payees, shares))
        );

        paymentSplitter = PaymentSplitterUpgradeable(payable(address(proxy)));

        vm.deal(beef, 200 ether);

        // build a merkle tree for testing
        address[] memory traders = new address[](3);
        traders[0] = trader1;
        traders[1] = trader2;
        traders[2] = trader3;
        bytes32[] memory leaves = new bytes32[](traders.length);
        leaves[0] = MerkleTreeHelper.leaf(trader1);
        leaves[1] = MerkleTreeHelper.leaf(trader2);
        leaves[2] = MerkleTreeHelper.leaf(trader3);
        merkleRoot = MerkleTreeTestHelper.buildRoot(leaves);
        merkleProof = MerkleTreeTestHelper.buildProof(leaves, 0);

        // build an invalid merkle tree for testing
        address[] memory invalidTraders = new address[](3);
        invalidTraders[0] = invalidTrader1;
        invalidTraders[1] = invalidTrader2;
        invalidTraders[2] = invalidTrader3;
        bytes32[] memory invalidLeaves = new bytes32[](invalidTraders.length);
        invalidLeaves[0] = MerkleTreeHelper.leaf(invalidTrader1);
        invalidLeaves[1] = MerkleTreeHelper.leaf(invalidTrader2);
        invalidLeaves[2] = MerkleTreeHelper.leaf(invalidTrader3);
        invalidMerkleRoot = MerkleTreeTestHelper.buildRoot(invalidLeaves);
        invalidMerkleProof = MerkleTreeTestHelper.buildProof(invalidLeaves, 0);
    }

    function test_Fail_DeployVaultFactoryWithBasicPool() public {
        uint256[] memory pairIds = new uint256[](1);
        pairIds[0] = 1;

        IERC20[] memory tokenPath = new IERC20[](2);
        tokenPath[0] = IERC20(address(wrappedNativeToken));
        tokenPath[1] = IERC20(address(stableToken));

        uint256[] memory pairBinSteps = new uint256[](1);
        pairBinSteps[0] = uint256(ILBPair(address(nativeLBTokenPairMock)).getBinStep());

        Version[] memory versions = new Version[](1);
        versions[0] = Version.V2_2;

        Path memory path;
        path.pairBinSteps = pairBinSteps;
        path.versions = versions;
        path.tokenPath = tokenPath;

        Route[] memory routes = new Route[](1);
        routes[0] = Route({
            pair: address(nativeLBTokenPairMock),
            from: address(wrappedNativeToken),
            to: address(stableToken),
            stable: false,
            concentrated: false, // should trigger revert
            receiver: address(0)
        });

        ApprovedPair memory approvedPair = ApprovedPair({
            stableTokenAddress: address(stableToken),
            vaultTokenAddress: address(0),
            wrappedNativeTokenAddress: address(wrappedNativeToken),
            routerAddress: address(lbRouterMock),
            swapPath: path,
            routerV2Address: address(1),
            swapRoutes: routes,
            chainlinkPriceOracleAddress: address(chainlinkPriceOracleMock),
            maxPriceAge: 21_600
        });

        ApprovedPair[] memory approvedPairs = new ApprovedPair[](pairIds.length);
        approvedPairs[0] = approvedPair;

        uint256 decimals = stableToken.decimals();

        vm.expectRevert(IDualTokenVaultFactoryEvents.BasicPoolsNotSupported.selector);
        new DualTokenVaultFactory(
            address(vaultImplementation),
            address(paymentSplitter),
            100 * (10 ** decimals),
            200,
            2000,
            "",
            merkleRoot,
            pairIds,
            approvedPairs
        );
    }

    function test_DeployVaultFactory() public {
        uint256[] memory pairIds = new uint256[](2);
        pairIds[0] = 1;
        pairIds[1] = 2;

        IERC20[] memory tokenPath = new IERC20[](2);

        tokenPath[0] = IERC20(address(wrappedNativeToken)); // input token
        tokenPath[1] = IERC20(address(stableToken)); // output token

        uint256[] memory pairBinSteps = new uint256[](1);
        pairBinSteps[0] = uint256(ILBPair(address(nativeLBTokenPairMock)).getBinStep());

        Version[] memory versions = new Version[](1);
        versions[0] = Version.V2_2; // add the version of the pair to perform the swap on

        Path memory path; // instantiate and populate the path to perform the swap.
        path.pairBinSteps = pairBinSteps;
        path.versions = versions;
        path.tokenPath = tokenPath;

        Route[] memory routes = new Route[](1);
        routes[0] = Route({
            pair: address(nativeLBTokenPairMock),
            from: address(wrappedNativeToken),
            to: address(stableToken),
            stable: false,
            concentrated: true,
            receiver: address(0)
        });

        ApprovedPair memory approvedPair1 = ApprovedPair({
            stableTokenAddress: address(stableToken),
            vaultTokenAddress: address(0),
            wrappedNativeTokenAddress: address(wrappedNativeToken),
            routerAddress: address(lbRouterMock), // mock lb router address
            swapPath: path,
            routerV2Address: address(1), // mock blackhole router address
            swapRoutes: routes,
            chainlinkPriceOracleAddress: address(chainlinkPriceOracleMock),
            maxPriceAge: 21_600
        });

        IERC20[] memory tokenPath2 = new IERC20[](2);

        tokenPath2[0] = IERC20(address(wBTC)); // input token
        tokenPath2[1] = IERC20(address(stableToken)); // output token

        uint256[] memory pairBinSteps2 = new uint256[](1);
        pairBinSteps2 = new uint256[](1);
        pairBinSteps2[0] = uint256(ILBPair(address(wBTCLBTokenPairMock)).getBinStep());

        Version[] memory versions2 = new Version[](1);
        versions2[0] = Version.V2_2; // add the version of the pair to perform the swap on

        Path memory path2; // instantiate and populate the path to perform the swap.
        path2.pairBinSteps = pairBinSteps2;
        path2.versions = versions2;
        path2.tokenPath = tokenPath2;

        Route[] memory routes2 = new Route[](1);
        routes2[0] = Route({
            pair: address(wBTCLBTokenPairMock),
            from: address(wBTC),
            to: address(stableToken),
            stable: false,
            concentrated: true,
            receiver: address(0)
        });

        ApprovedPair memory approvedPair2 = ApprovedPair({
            stableTokenAddress: address(stableToken),
            vaultTokenAddress: address(wBTC),
            wrappedNativeTokenAddress: address(0),
            routerAddress: address(lbRouterMock), // mock lb router address
            swapPath: path2,
            routerV2Address: address(0x423098420984), // mock blackhole router address
            swapRoutes: routes2,
            chainlinkPriceOracleAddress: address(chainlinkPriceOracleMock),
            maxPriceAge: 21_600
        });

        ApprovedPair[] memory approvedPairs = new ApprovedPair[](pairIds.length);
        approvedPairs[0] = approvedPair1;
        approvedPairs[1] = approvedPair2;

        // deploy the factory contract
        vaultFactory = new DualTokenVaultFactory(
            address(vaultImplementation),
            address(paymentSplitter), // payment splitter address
            100 * (10 ** stableToken.decimals()), // $100 minimum USD price per bond
            200, // 2% management fee
            2000, // 20% performance fee
            "", // dummy URI
            merkleRoot,
            pairIds,
            approvedPairs
        );
    }

    function test_Fail_CreateVaultInsufficientNativeSent() public {
        test_DeployVaultFactory();

        vm.startPrank(beef);
        stableToken.mint(beef, 1_000_000 ether);
        stableToken.approve(address(vaultFactory), type(uint256).max);

        uint256 bondPrice = 100 ether;

        // attempt to create a vault with insufficient native tokens sent
        vm.expectRevert(
            abi.encodeWithSelector(
                IDualTokenVaultEvents.IncorrectNativeTokenAmountSent.selector,
                (bondPrice * (BPS_DENOMINATOR + vaultFactory.managementFee())) / BPS_DENOMINATOR,
                0
            )
        );
        vaultFactory.createVaultAndIssueBond{value: 0}(
            UserConfigurableVaultParameters({
                bondPrice: bondPrice,
                maxStableTokenAmount: 1_000 ether,
                reserveRatio: 2000,
                tradingPeriodDuration: 96 days,
                pairId: 1,
                primaryDex: Dex.LFJ
            })
        );
        vm.stopPrank();
    }

    function test_Fail_CreateVaultWithLessThanMinimumUSDPricePerBond() public {
        test_DeployVaultFactory();

        vm.startPrank(beef);
        stableToken.mint(beef, 1_000_000 ether);
        stableToken.approve(address(vaultFactory), type(uint256).max);

        uint256 bondPrice = 5 ether; // $50 at 1 NATIVE = $10
        uint16 reserveRatio = 2000; // 20%
        uint256 managementFee = vaultFactory.managementFee();

        uint8 decimals = stableToken.decimals();

        uint256 expected = (NATIVE_TO_USD_RATE * (bondPrice * reserveRatio)) / BPS_DENOMINATOR;
        expected = expected / (10 ** (18 - decimals));

        // attempt to create a vault with a bond price below the minimum USD price per bond
        vm.expectRevert(
            abi.encodeWithSelector(
                IDualTokenVaultFactoryEvents.StableTokenAmountBelowMinimumRequired.selector,
                vaultFactory.minUSDPricePerBond(),
                expected
            )
        );
        vaultFactory.createVaultAndIssueBond{value: (bondPrice * (BPS_DENOMINATOR + managementFee)) / BPS_DENOMINATOR}(
            UserConfigurableVaultParameters({
                bondPrice: bondPrice,
                maxStableTokenAmount: 1_000 ether,
                reserveRatio: reserveRatio,
                tradingPeriodDuration: 96 days,
                pairId: 1,
                primaryDex: Dex.LFJ
            })
        );

        bondPrice = 9.999 ether; // $99.99 at 1 NATIVE = $10

        expected = (NATIVE_TO_USD_RATE * (bondPrice * reserveRatio)) / BPS_DENOMINATOR;
        expected = expected / (10 ** (18 - decimals));

        // attempt to create a vault with a bond price below the minimum USD price per bond
        vm.expectRevert(
            abi.encodeWithSelector(
                IDualTokenVaultFactoryEvents.StableTokenAmountBelowMinimumRequired.selector,
                vaultFactory.minUSDPricePerBond(),
                expected
            )
        );
        vaultFactory.createVaultAndIssueBond{value: (bondPrice * (BPS_DENOMINATOR + managementFee)) / BPS_DENOMINATOR}(
            UserConfigurableVaultParameters({
                bondPrice: bondPrice,
                maxStableTokenAmount: 1_000 ether,
                reserveRatio: reserveRatio,
                tradingPeriodDuration: 96 days,
                pairId: 1,
                primaryDex: Dex.LFJ
            })
        );

        // this should succeed since the bond price meets the minimum USD price per bond requirement
        bondPrice = 10 ether; // $100 at 1 NATIVE = $10
        vaultFactory.createVaultAndIssueBond{value: (bondPrice * (BPS_DENOMINATOR + managementFee)) / BPS_DENOMINATOR}(
            UserConfigurableVaultParameters({
                bondPrice: bondPrice,
                maxStableTokenAmount: 1_000 ether,
                reserveRatio: reserveRatio,
                tradingPeriodDuration: 96 days,
                pairId: 1,
                primaryDex: Dex.LFJ
            })
        );

        vm.stopPrank();
    }

    function test_Fail_CreateVaultWithStalePrice() public {
        test_DeployVaultFactory();

        vm.startPrank(beef);
        stableToken.mint(beef, 1_000_000 ether);
        stableToken.approve(address(vaultFactory), type(uint256).max);

        uint256 bondPrice = 100 ether;

        // warp time to make the chainlink price stale
        vm.warp(vaultFactory.getApprovedPair(1).approvedPair.maxPriceAge + 100);

        uint256 managementFee = vaultFactory.managementFee();

        // attempt to create a vault with a stale price
        vm.expectRevert(IDualTokenVaultEvents.StaleOrInvalidPriceData.selector);

        vaultFactory.createVaultAndIssueBond{value: (bondPrice * (BPS_DENOMINATOR + managementFee)) / BPS_DENOMINATOR}(
            UserConfigurableVaultParameters({
                bondPrice: bondPrice,
                maxStableTokenAmount: 1_000 ether,
                reserveRatio: 2000,
                tradingPeriodDuration: 96 days,
                pairId: 1,
                primaryDex: Dex.LFJ
            })
        );

        vm.stopPrank();
    }

    function test_CreateVault() public {
        test_DeployVaultFactory();

        vm.startPrank(beef);
        stableToken.mint(beef, 1_000_000 ether);
        stableToken.approve(address(vaultFactory), type(uint256).max);

        uint256 bondPrice = 100 ether;

        address deployedAddress = vaultFactory.createVaultAndIssueBond{
            value: (bondPrice * (BPS_DENOMINATOR + vaultFactory.managementFee())) / BPS_DENOMINATOR
        }(
            UserConfigurableVaultParameters({
                bondPrice: bondPrice,
                maxStableTokenAmount: 1_000 ether,
                reserveRatio: 2000,
                tradingPeriodDuration: 96 days,
                pairId: 1,
                primaryDex: Dex.LFJ
            })
        );
        vm.stopPrank();

        DualTokenVault vault1 = DualTokenVault(payable(deployedAddress));

        VaultParameters memory config = vault1.getVaultConfig();
        uint256 vaultId = config.vaultId;

        // make sure the vault ID is 1
        assertEq(vaultId, 1);

        // get the balance of the vaultId 1 receipt token for beef
        uint256 receiptTokenBalance = VaultReceiptToken(vaultFactory.receiptTokenAddress()).balanceOf(beef, vaultId);

        // make sure beef has receipt tokens
        assertEq(receiptTokenBalance, 1);

        // check that the vault received the correct native token amount
        uint256 vaultNativeBalance = address(vault1).balance;
        assertEq(vaultNativeBalance, config.bondPrice);

        uint8 decimals = stableToken.decimals();

        uint256 expected = (NATIVE_TO_USD_RATE * (config.bondPrice * config.reserveRatio)) / BPS_DENOMINATOR;

        // convert from 1e18 to the stable token decimals
        expected = expected / (10 ** (18 - decimals));

        // check that the vault received the correct stable token amount
        uint256 vaultStableBalance = stableToken.balanceOf(address(vault1));
        assertEq(vaultStableBalance, expected);

        // check that the fee splitter received the correct native token amount
        uint256 paymentSplitterNativeBalance = address(paymentSplitter).balance;
        uint256 expectedAmount = (config.bondPrice * config.managementFee) / BPS_DENOMINATOR;
        assertEq(paymentSplitterNativeBalance, expectedAmount);
    }

    function test_getActiveVaults() public {
        test_DeployVaultFactory();

        vm.deal(beef, 1000 ether);

        vm.startPrank(beef);
        stableToken.mint(beef, 1_000_000 ether);
        stableToken.approve(address(vaultFactory), type(uint256).max);

        uint256 bondPrice = 100 ether;
        uint256 vaultsToCreate = 3;

        for (uint i = 0; i < vaultsToCreate; i++) {
            vaultFactory.createVaultAndIssueBond{
                value: (bondPrice * (BPS_DENOMINATOR + vaultFactory.managementFee())) / BPS_DENOMINATOR
            }(
                UserConfigurableVaultParameters({
                    bondPrice: bondPrice,
                    maxStableTokenAmount: 1_000 ether,
                    reserveRatio: 2000,
                    tradingPeriodDuration: 96 days,
                    pairId: 1,
                    primaryDex: Dex.LFJ
                })
            );
        }

        vm.stopPrank();

        VaultCreationDataWithId[] memory activeVaults = vaultFactory.getActiveVaults();

        // make sure all vault addresses are unique
        assertNotEq(activeVaults[0].vaultCreationData.vaultAddress, activeVaults[1].vaultCreationData.vaultAddress);
        assertNotEq(activeVaults[1].vaultCreationData.vaultAddress, activeVaults[2].vaultCreationData.vaultAddress);

        // make sure there are 3 vaults as expected
        assertEq(activeVaults.length, 3);
    }

    function test_CreateERC20Vault() public {
        test_DeployVaultFactory();

        vm.startPrank(beef);
        stableToken.mint(beef, 1_000_000 ether);
        stableToken.approve(address(vaultFactory), type(uint256).max);

        wBTC.mint(beef, 102 ether);
        wBTC.approve(address(vaultFactory), type(uint256).max);

        uint256 bondPrice = 100 ether;

        address deployedAddress = vaultFactory.createVaultAndIssueBond(
            UserConfigurableVaultParameters({
                bondPrice: bondPrice,
                maxStableTokenAmount: 1_000 ether,
                reserveRatio: 2000,
                tradingPeriodDuration: 96 days,
                pairId: 2,
                primaryDex: Dex.LFJ
            })
        );
        vm.stopPrank();

        DualTokenVault vault1 = DualTokenVault(payable(deployedAddress));

        VaultParameters memory config = vault1.getVaultConfig();
        uint256 vaultId = config.vaultId;

        // make sure the vault ID is 1
        assertEq(vaultId, 1);

        // get the balance of the vaultId 1 receipt token for beef
        uint256 receiptTokenBalance = VaultReceiptToken(vaultFactory.receiptTokenAddress()).balanceOf(beef, vaultId);

        // make sure beef has receipt tokens
        assertEq(receiptTokenBalance, 1);

        uint8 decimals = stableToken.decimals();

        uint256 expected = (NATIVE_TO_USD_RATE * (config.bondPrice * config.reserveRatio)) / BPS_DENOMINATOR;

        // convert from 1e18 to the stable token decimals
        expected = expected / (10 ** (18 - decimals));

        // check that the vault received the correct stable token amount
        uint256 vaultStableBalance = stableToken.balanceOf(address(vault1));
        assertEq(vaultStableBalance, expected);
    }

    function test_Fail_RedeemBondTooEarly() public {
        test_CreateVault();

        VaultCreationDataWithId memory vaultData = vaultFactory.getVault(1);
        DualTokenVault vault = DualTokenVault(payable(vaultData.vaultCreationData.vaultAddress));

        vm.startPrank(beef);

        // allow the vault to burn the receipt token
        VaultReceiptToken(vaultFactory.receiptTokenAddress()).setApprovalForAll(address(vault), true);

        // attempt to redeem the bond too early
        vm.expectRevert(IDualTokenVaultEvents.BondNotYetRedeemable.selector);
        vault.redeemBond();

        vm.stopPrank();
    }

    function test_LBSwapDuringTradingPeriod() public {
        test_CreateVault();

        VaultCreationDataWithId memory vaultData = vaultFactory.getVault(1);
        DualTokenVault vault = DualTokenVault(payable(vaultData.vaultCreationData.vaultAddress));

        // give the vault and the router some tokens to facilitate the swap
        vm.deal(vaultData.vaultCreationData.vaultAddress, 10 ether);
        vm.deal(address(lbRouterMock), 10 ether);
        stableToken.mint(vaultData.vaultCreationData.vaultAddress, 1_000 ether);
        stableToken.mint(address(lbRouterMock), 1_000 ether);

        // attempt to trade while trading period is open
        vm.startPrank(trader1);
        vault.lbSwapExactInputSingle(1 ether, 1, address(0), 1, merkleProof);
        vm.stopPrank();
    }

    function test_Fail_InvalidMerkleProof() public {
        test_CreateVault();

        VaultCreationDataWithId memory vaultData = vaultFactory.getVault(1);
        DualTokenVault vault = DualTokenVault(payable(vaultData.vaultCreationData.vaultAddress));

        // attempt to trade while trading period is open with an invalid merkle proof
        vm.startPrank(trader1);
        vm.expectRevert(IDualTokenVaultEvents.InvalidMerkleProof.selector);
        vault.lbSwapExactInputSingle(1, 1, address(0), 1, invalidMerkleProof);
        vm.stopPrank();
    }

    function test_Fail_ValidMerkleProofWithInvalidAddress() public {
        test_CreateVault();

        VaultCreationDataWithId memory vaultData = vaultFactory.getVault(1);
        DualTokenVault vault = DualTokenVault(payable(vaultData.vaultCreationData.vaultAddress));

        // attempt to trade while trading period is open with a valid merkle proof but an address not in the tree
        vm.startPrank(bob);
        vm.expectRevert(IDualTokenVaultEvents.InvalidMerkleProof.selector);
        vault.lbSwapExactInputSingle(1, 1, address(0), 1, invalidMerkleProof);
        vm.stopPrank();
    }

    function test_Fail_LbSwapTradePeriodClosed() public {
        test_CreateVault();

        VaultCreationDataWithId memory vaultData = vaultFactory.getVault(1);
        DualTokenVault vault = DualTokenVault(payable(vaultData.vaultCreationData.vaultAddress));

        // fast forward time by 100 days to surpass the trading period
        vm.warp(block.timestamp + 100 days);

        // attempt to trade after the trading period has closed
        vm.startPrank(trader1);
        vm.expectRevert(IDualTokenVaultEvents.TradingPeriodClosed.selector);
        vault.lbSwapExactInputSingle(1, 1, address(0), 1, merkleProof);
        vm.stopPrank();
    }

    function test_Fail_blackholeSwapTradePeriodClosed() public {
        test_CreateVault();

        VaultCreationDataWithId memory vaultData = vaultFactory.getVault(1);
        DualTokenVault vault = DualTokenVault(payable(vaultData.vaultCreationData.vaultAddress));

        // fast forward time by 100 days to surpass the trading period
        vm.warp(block.timestamp + 100 days);

        // attempt to trade after the trading period has closed
        vm.startPrank(trader1);
        vm.expectRevert(IDualTokenVaultEvents.TradingPeriodClosed.selector);
        vault.blackholeSwapExactInputSingle(1, 1, address(0), 1, merkleProof);
        vm.stopPrank();
    }

    function test_Fail_RedeemBondWithoutReceiptToken() public {
        test_CreateVault();

        VaultCreationDataWithId memory vaultData = vaultFactory.getVault(1);
        DualTokenVault vault = DualTokenVault(payable(vaultData.vaultCreationData.vaultAddress));

        vm.startPrank(bob);

        // fast forward time by 100 days to surpass the trading period
        vm.warp(block.timestamp + 100 days);

        // allow the vault to burn the receipt token
        VaultReceiptToken(vaultFactory.receiptTokenAddress()).setApprovalForAll(address(vault), true);

        // attempt to redeem the bond without owning the receipt token
        vm.expectRevert(abi.encodeWithSelector(IERC1155Errors.ERC1155InsufficientBalance.selector, bob, 0, 1, 1));
        vault.redeemBond();

        vm.stopPrank();
    }

    function test_RedeemBond() public {
        test_CreateVault();

        VaultCreationDataWithId memory vaultData = vaultFactory.getVault(1);
        DualTokenVault vault = DualTokenVault(payable(vaultData.vaultCreationData.vaultAddress));
        VaultParameters memory config = vault.getVaultConfig();

        // send the vault some native tokens to simulate earnings
        vm.deal(address(vault), address(vault).balance + 10 ether);

        vm.startPrank(beef);

        // fast forward time by 100 days to surpass the trading period
        vm.warp(block.timestamp + 100 days);

        // allow the vault to burn the receipt token
        VaultReceiptToken(vaultFactory.receiptTokenAddress()).setApprovalForAll(address(vault), true);

        // get beef's native token balance before redemption
        uint256 beefNativeBeforeRedemption = beef.balance;

        vault.redeemBond();

        // check to make sure that beef received the native token earnings he originally put in, plus 80% of the earnings
        uint256 beefNativeAfterRedemption = beef.balance;
        assertEq((beefNativeAfterRedemption - beefNativeBeforeRedemption), config.bondPrice + 8 ether);

        vm.stopPrank();
    }

    function test_RedeemERC20Bond() public {
        test_CreateERC20Vault();

        VaultCreationDataWithId memory vaultData = vaultFactory.getVault(1);
        DualTokenVault vault = DualTokenVault(payable(vaultData.vaultCreationData.vaultAddress));
        VaultParameters memory config = vault.getVaultConfig();

        vm.startPrank(beef);

        // send the vault some wBTC to simulate earnings
        wBTC.mint(address(vault), 5 ether);

        // fast forward time by 100 days to surpass the trading period
        vm.warp(block.timestamp + 100 days);

        // allow the vault to burn the receipt token
        VaultReceiptToken(vaultFactory.receiptTokenAddress()).setApprovalForAll(address(vault), true);

        // get beef's wBTC balance before redemption
        uint256 beefWBTCBeforeRedemption = wBTC.balanceOf(beef);

        vault.redeemBond();

        // check to make sure that beef received the wBTC earnings he originally put in, plus 80% of the earnings
        // Initial vault balance: bondPrice (100 wBTC)
        // After minting 5 wBTC: 105 wBTC total
        // Profit = 105 - 100 = 5 wBTC
        // Performance fee (20%) = 5 * 0.2 = 1 wBTC
        // User receives = 105 - 1 = 104 wBTC (100 original + 4 profit after fee)
        uint256 beefWBTCAfterRedemption = wBTC.balanceOf(beef);
        assertEq((beefWBTCAfterRedemption - beefWBTCBeforeRedemption), config.bondPrice + 4 ether);

        vm.stopPrank();
    }

    function test_WithdrawPaymentsAfterVaultCreation() public {
        test_CreateVault();

        // check initial balances
        uint256 initialPaymentSplitterBalance = address(paymentSplitter).balance;
        uint256 teamInitialBalance = team.balance;
        uint256 partnerInitialBalance = partner.balance;

        // withdraw native balance to payees
        paymentSplitter.withdrawNative();

        // check final balances
        uint256 teamFinalBalance = team.balance;
        uint256 partnerFinalBalance = partner.balance;

        // make sure the total payment matches the initial balance of the payment splitter
        uint256 totalPayment = (teamFinalBalance - teamInitialBalance) + (partnerFinalBalance - partnerInitialBalance);
        assertEq(totalPayment, initialPaymentSplitterBalance);

        // make sure each payee received 50%
        assertEq(partnerFinalBalance - partnerInitialBalance, initialPaymentSplitterBalance / 2);
        assertEq(teamFinalBalance - teamInitialBalance, initialPaymentSplitterBalance / 2);
    }

    function test_WithdrawPaymentsAfterRedemption() public {
        test_RedeemBond();

        // check initial balances
        uint256 initialPaymentSplitterBalance = address(paymentSplitter).balance;
        uint256 teamInitialBalance = team.balance;
        uint256 partnerInitialBalance = partner.balance;

        // withdraw native balance to payees
        paymentSplitter.withdrawNative();

        // check final balances
        uint256 teamFinalBalance = team.balance;
        uint256 partnerFinalBalance = partner.balance;

        // make sure the total payment matches the initial balance of the payment splitter
        uint256 totalPayment = (teamFinalBalance - teamInitialBalance) + (partnerFinalBalance - partnerInitialBalance);
        assertEq(totalPayment, initialPaymentSplitterBalance);

        // make sure each payee received 50%
        assertEq(partnerFinalBalance - partnerInitialBalance, initialPaymentSplitterBalance / 2);
        assertEq(teamFinalBalance - teamInitialBalance, initialPaymentSplitterBalance / 2);
    }

    function test_RedeemBond_ProfitInVaultTokenOnly_OraclePath() public {
        (DualTokenVault vault, VaultParameters memory config) = _getVaultAfterCreation();

        uint256 startingStable = stableToken.balanceOf(address(vault));
        vm.deal(address(vault), config.bondPrice + 10 ether);

        vm.warp(block.timestamp + 100 days);
        _refreshOracle();

        vm.startPrank(beef);
        VaultReceiptToken(vaultFactory.receiptTokenAddress()).setApprovalForAll(address(vault), true);

        uint256 beefNativeBefore = beef.balance;
        uint256 beefStableBefore = stableToken.balanceOf(beef);

        vault.redeemBond();

        // 10 ETH profit, 20% fee = 2 ETH → redeemer gets 108 ETH
        assertEq(beef.balance - beefNativeBefore, config.bondPrice + 8 ether, "native: wrong amount");
        assertEq(stableToken.balanceOf(beef) - beefStableBefore, startingStable, "stable: fully returned");

        vm.stopPrank();
    }

    function test_RedeemBond_ProfitInStableOnly_FeeChargedInVaultToken() public {
        (DualTokenVault vault, VaultParameters memory config) = _getVaultAfterCreation();

        vm.deal(address(vault), config.bondPrice);
        // 10 USDC = 1 ETH at mock price ($10/ETH, 8 price decimals)
        uint256 extraStable = 10 * (10 ** uint256(stableToken.decimals()));
        stableToken.mint(address(vault), extraStable);
        uint256 endingStable = stableToken.balanceOf(address(vault));

        vm.warp(block.timestamp + 100 days);
        _refreshOracle();

        // profit = 1 ETH (in vault terms), fee = 0.2 ETH
        uint256 extraStableAsVault = _stableToVault(extraStable, vault, config);
        uint256 expectedFeeVault = Math.mulDiv(extraStableAsVault, config.performanceFee, BPS_DENOMINATOR);

        vm.startPrank(beef);
        VaultReceiptToken(vaultFactory.receiptTokenAddress()).setApprovalForAll(address(vault), true);

        uint256 beefNativeBefore = beef.balance;
        uint256 beefStableBefore = stableToken.balanceOf(beef);

        vault.redeemBond();

        assertEq(beef.balance - beefNativeBefore, config.bondPrice - expectedFeeVault, "native: fee for stable profit");
        assertEq(stableToken.balanceOf(beef) - beefStableBefore, endingStable, "stable: full ending returned");

        vm.stopPrank();
    }

    function test_RedeemBond_ProfitInBothTokens_FeeInVaultToken() public {
        (DualTokenVault vault, VaultParameters memory config) = _getVaultAfterCreation();

        uint256 extraVault = 10 ether;
        // 10 USDC = 1 ETH
        uint256 extraStable = 10 * (10 ** uint256(stableToken.decimals()));

        vm.deal(address(vault), config.bondPrice + extraVault);
        stableToken.mint(address(vault), extraStable);
        uint256 endingStable = stableToken.balanceOf(address(vault));

        vm.warp(block.timestamp + 100 days);
        _refreshOracle();

        // profit = 10 ETH (vault) + 1 ETH (stable equiv) = 11 ETH, fee = 2.2 ETH
        uint256 extraStableAsVault = _stableToVault(extraStable, vault, config);
        uint256 totalProfit = extraVault + extraStableAsVault;
        uint256 expectedFeeVault = Math.mulDiv(totalProfit, config.performanceFee, BPS_DENOMINATOR);

        vm.startPrank(beef);
        VaultReceiptToken(vaultFactory.receiptTokenAddress()).setApprovalForAll(address(vault), true);

        uint256 beefNativeBefore = beef.balance;
        uint256 beefStableBefore = stableToken.balanceOf(beef);

        vault.redeemBond();

        assertEq(
            beef.balance - beefNativeBefore,
            (config.bondPrice + extraVault) - expectedFeeVault,
            "native: combined fee"
        );
        assertEq(stableToken.balanceOf(beef) - beefStableBefore, endingStable, "stable: full returned");

        vm.stopPrank();
    }

    function test_RedeemBond_FeeSpilloverIntoStable() public {
        (DualTokenVault vault, VaultParameters memory config) = _getVaultAfterCreation();

        // With mock: 1 ETH = 10 USDC, startingStable = 200 USDC (20 ETH equiv)
        // startingTotal = 100 + 20 = 120 ETH
        //
        // To force spillover we need: fee > endingVaultBalance
        // i.e. profit * 20% > 1 ETH  →  profit > 5 ETH
        //
        // endingVault = 1 ETH, endingStable = 2000 USDC (200 ETH equiv)
        // endingTotal = 1 + 200 = 201 ETH
        // profit      = 81 ETH, fee = 16.2 ETH > 1 ETH  → spillover confirmed
        uint256 endingVault = 1 ether;
        uint256 endingStableRaw = 2000 * (10 ** uint256(stableToken.decimals()));

        vm.deal(address(vault), endingVault);
        uint256 existingStable = stableToken.balanceOf(address(vault));
        // existingStable = 200 USDC from issuance; mint the difference
        if (endingStableRaw > existingStable) {
            stableToken.mint(address(vault), endingStableRaw - existingStable);
        }

        uint256 startingVaultAmt = vault.getVaultData().startingVaultTokenBalance;
        uint256 startingStableAmt = vault.getVaultData().startingStableTokenBalance;

        vm.warp(block.timestamp + 100 days);
        _refreshOracle();

        // Derive expected fee amounts using the same oracle path as the contract
        uint256 startingStableAsVault = _stableToVault(startingStableAmt, vault, config);
        uint256 endingStableAsVault = _stableToVault(endingStableRaw, vault, config);
        uint256 startingTotal = startingVaultAmt + startingStableAsVault;
        uint256 endingTotal = endingVault + endingStableAsVault;
        uint256 totalFeeInVault = Math.mulDiv(endingTotal - startingTotal, config.performanceFee, BPS_DENOMINATOR);

        // All vault tokens go to fee; remainder converted to stable
        uint256 expectedFeeVault = endingVault;
        uint256 remainingFeeVault = totalFeeInVault - expectedFeeVault;
        uint256 expectedFeeStable = vault.getRequiredStableTokenAmount(
            remainingFeeVault,
            BPS_DENOMINATOR,
            config.vaultTokenAddress,
            config.stableTokenAddress,
            config.chainlinkPriceOracleAddress
        );
        if (expectedFeeStable > endingStableRaw) expectedFeeStable = endingStableRaw;

        vm.startPrank(beef);
        VaultReceiptToken(vaultFactory.receiptTokenAddress()).setApprovalForAll(address(vault), true);

        uint256 beefNativeBefore = beef.balance;
        uint256 beefStableBefore = stableToken.balanceOf(beef);
        uint256 splitterNativeBefore = address(paymentSplitter).balance;
        uint256 splitterStableBefore = stableToken.balanceOf(address(paymentSplitter));

        vault.redeemBond();

        assertEq(beef.balance - beefNativeBefore, 0, "redeemer: no vault tokens");
        assertEq(
            stableToken.balanceOf(beef) - beefStableBefore,
            endingStableRaw - expectedFeeStable,
            "redeemer: stable after fee"
        );
        assertEq(address(paymentSplitter).balance - splitterNativeBefore, expectedFeeVault, "splitter: vault fee");
        assertEq(
            stableToken.balanceOf(address(paymentSplitter)) - splitterStableBefore,
            expectedFeeStable,
            "splitter: stable fee"
        );

        vm.stopPrank();
    }

    function test_RedeemBond_NoProfit_NoFee() public {
        (DualTokenVault vault, VaultParameters memory config) = _getVaultAfterCreation();

        uint256 startingStable = stableToken.balanceOf(address(vault));
        vm.deal(address(vault), config.bondPrice);

        vm.warp(block.timestamp + 100 days);
        _refreshOracle();

        vm.startPrank(beef);
        VaultReceiptToken(vaultFactory.receiptTokenAddress()).setApprovalForAll(address(vault), true);

        uint256 beefNativeBefore = beef.balance;
        uint256 beefStableBefore = stableToken.balanceOf(beef);
        uint256 splitterBefore = address(paymentSplitter).balance;

        vault.redeemBond();

        assertEq(beef.balance - beefNativeBefore, beef.balance - beefNativeBefore, "redeemer: full vault returned");
        assertEq(beef.balance - beefNativeBefore, config.bondPrice, "redeemer: exact bond price");
        assertEq(stableToken.balanceOf(beef) - beefStableBefore, startingStable, "redeemer: full stable returned");
        assertEq(address(paymentSplitter).balance - splitterBefore, 0, "splitter: no fee");

        vm.stopPrank();
    }

    function test_RedeemBond_LossInStable_NoFee() public {
        (DualTokenVault vault, VaultParameters memory config) = _getVaultAfterCreation();

        uint256 startingStable = stableToken.balanceOf(address(vault));
        vm.prank(address(vault));
        bool success = stableToken.transfer(address(0xdead), startingStable / 2);
        if (!success) revert("Stable token transfer failed");

        vm.deal(address(vault), config.bondPrice);

        vm.warp(block.timestamp + 100 days);
        _refreshOracle();

        vm.startPrank(beef);
        VaultReceiptToken(vaultFactory.receiptTokenAddress()).setApprovalForAll(address(vault), true);

        uint256 splitterBefore = address(paymentSplitter).balance;

        vault.redeemBond();

        assertEq(address(paymentSplitter).balance - splitterBefore, 0, "splitter: no fee on loss");

        vm.stopPrank();
    }

    function test_RedeemBond_OracleStaleFallback_VaultTokenProfit() public {
        (DualTokenVault vault, VaultParameters memory config) = _getVaultAfterCreation();

        uint256 startingStable = stableToken.balanceOf(address(vault));
        vm.deal(address(vault), config.bondPrice + 10 ether);

        // Do NOT refresh oracle — warp past maxPriceAge to trigger fallback
        vm.warp(block.timestamp + 100 days + config.maxPriceAge + 1);

        vm.startPrank(beef);
        VaultReceiptToken(vaultFactory.receiptTokenAddress()).setApprovalForAll(address(vault), true);

        uint256 beefNativeBefore = beef.balance;
        uint256 beefStableBefore = stableToken.balanceOf(beef);

        vm.expectEmit(true, true, true, false);
        emit IDualTokenVaultEvents.OracleFallbackOnRedemption(
            beef,
            config.vaultTokenAddress,
            config.stableTokenAddress
        );

        vault.redeemBond();

        // Fallback: vault-token profit only, 10 ETH * 20% = 2 ETH fee
        assertEq(beef.balance - beefNativeBefore, config.bondPrice + 8 ether, "fallback: native received");
        assertEq(stableToken.balanceOf(beef) - beefStableBefore, startingStable, "fallback: stable returned");

        vm.stopPrank();
    }

    function test_RedeemBond_OracleStaleFallback_NoProfit() public {
        (DualTokenVault vault, VaultParameters memory config) = _getVaultAfterCreation();

        uint256 startingStable = stableToken.balanceOf(address(vault));
        vm.deal(address(vault), config.bondPrice);

        vm.warp(block.timestamp + 100 days + config.maxPriceAge + 1);

        vm.startPrank(beef);
        VaultReceiptToken(vaultFactory.receiptTokenAddress()).setApprovalForAll(address(vault), true);

        uint256 beefNativeBefore = beef.balance;
        uint256 beefStableBefore = stableToken.balanceOf(beef);
        uint256 splitterBefore = address(paymentSplitter).balance;

        vm.expectEmit(true, true, true, false);
        emit IDualTokenVaultEvents.OracleFallbackOnRedemption(
            beef,
            config.vaultTokenAddress,
            config.stableTokenAddress
        );

        vault.redeemBond();

        assertEq(beef.balance - beefNativeBefore, config.bondPrice, "fallback no-profit: vault returned");
        assertEq(stableToken.balanceOf(beef) - beefStableBefore, startingStable, "fallback no-profit: stable returned");
        assertEq(address(paymentSplitter).balance - splitterBefore, 0, "fallback no-profit: no fee");

        vm.stopPrank();
    }

    function test_RedeemBond_OracleStaleFallback_ProfitOnlyInStable_ZeroFee() public {
        (DualTokenVault vault, VaultParameters memory config) = _getVaultAfterCreation();

        vm.deal(address(vault), config.bondPrice);
        stableToken.mint(address(vault), 50 * (10 ** uint256(stableToken.decimals())));
        uint256 endingStable = stableToken.balanceOf(address(vault));

        vm.warp(block.timestamp + 100 days + config.maxPriceAge + 1);

        vm.startPrank(beef);
        VaultReceiptToken(vaultFactory.receiptTokenAddress()).setApprovalForAll(address(vault), true);

        uint256 beefStableBefore = stableToken.balanceOf(beef);
        uint256 splitterBefore = address(paymentSplitter).balance;

        vm.expectEmit(true, true, true, false);
        emit IDualTokenVaultEvents.OracleFallbackOnRedemption(
            beef,
            config.vaultTokenAddress,
            config.stableTokenAddress
        );

        vault.redeemBond();

        assertEq(address(paymentSplitter).balance - splitterBefore, 0, "fallback: no fee");
        assertEq(stableToken.balanceOf(beef) - beefStableBefore, endingStable, "fallback: full stable returned");

        vm.stopPrank();
    }

    function test_RedeemERC20Bond_ProfitInBothTokens_OraclePath() public {
        (DualTokenVault vault, VaultParameters memory config) = _getERC20VaultAfterCreation();

        uint256 extraVault = 5 ether;
        uint256 extraStable = 10 * (10 ** uint256(stableToken.decimals())); // 10 USDC = 1 wBTC equiv

        wBTC.mint(address(vault), extraVault);
        stableToken.mint(address(vault), extraStable);

        uint256 endingWBTC = wBTC.balanceOf(address(vault));
        uint256 endingStable = stableToken.balanceOf(address(vault));

        vm.warp(block.timestamp + 100 days);
        _refreshOracle();

        // profit = 5 wBTC + 1 wBTC (stable equiv) = 6 wBTC, fee = 1.2 wBTC
        uint256 extraStableAsVault = _stableToVault(extraStable, vault, config);
        uint256 totalProfit = extraVault + extraStableAsVault;
        uint256 expectedFeeVault = Math.mulDiv(totalProfit, config.performanceFee, BPS_DENOMINATOR);

        vm.startPrank(beef);
        VaultReceiptToken(vaultFactory.receiptTokenAddress()).setApprovalForAll(address(vault), true);

        uint256 beefWBTCBefore = wBTC.balanceOf(beef);
        uint256 beefStableBefore = stableToken.balanceOf(beef);

        vault.redeemBond();

        assertEq(wBTC.balanceOf(beef) - beefWBTCBefore, endingWBTC - expectedFeeVault, "erc20: wBTC after fee");
        assertEq(stableToken.balanceOf(beef) - beefStableBefore, endingStable, "erc20: stable returned");

        vm.stopPrank();
    }

    function test_RedeemBond_SpilloverFee_BothFeeEventsEmitted() public {
        (DualTokenVault vault, ) = _getVaultAfterCreation();

        // Same scenario as FeeSpilloverIntoStable: confirmed spillover
        uint256 endingVault = 1 ether;
        uint256 endingStableRaw = 2000 * (10 ** uint256(stableToken.decimals()));

        vm.deal(address(vault), endingVault);
        uint256 existingStable = stableToken.balanceOf(address(vault));
        if (endingStableRaw > existingStable) {
            stableToken.mint(address(vault), endingStableRaw - existingStable);
        }

        vm.warp(block.timestamp + 100 days);
        _refreshOracle();

        vm.startPrank(beef);
        VaultReceiptToken(vaultFactory.receiptTokenAddress()).setApprovalForAll(address(vault), true);

        vm.recordLogs();
        vault.redeemBond();
        Vm.Log[] memory logs = vm.getRecordedLogs();

        bytes32 feeCollectedSig = keccak256("FeeCollected(address,address,uint256)");
        uint256 feeEventCount = 0;
        for (uint i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == feeCollectedSig) {
                feeEventCount++;
            }
        }
        assertEq(feeEventCount, 2, "should emit two FeeCollected events on spillover");

        vm.stopPrank();
    }

    function test_RedeemBond_NoFallbackEvent_WhenOracleHealthy() public {
        (DualTokenVault vault, VaultParameters memory config) = _getVaultAfterCreation();

        vm.deal(address(vault), config.bondPrice + 10 ether);

        vm.warp(block.timestamp + 100 days);
        _refreshOracle();

        vm.startPrank(beef);
        VaultReceiptToken(vaultFactory.receiptTokenAddress()).setApprovalForAll(address(vault), true);

        vm.recordLogs();
        vault.redeemBond();
        Vm.Log[] memory logs = vm.getRecordedLogs();

        bytes32 fallbackSig = keccak256("OracleFallbackOnRedemption(address,address,address)");
        for (uint i = 0; i < logs.length; i++) {
            // Filter to only logs emitted by the vault itself
            if (logs[i].emitter == address(vault)) {
                assertNotEq(logs[i].topics[0], fallbackSig, "fallback event must not fire with healthy oracle");
            }
        }

        vm.stopPrank();
    }

    // ============================================================
    // Helpers
    // ============================================================

    function _refreshOracle() internal {
        chainlinkPriceOracleMock.setUpdatedAt(block.timestamp);
    }

    function _stableToVault(
        uint256 stableAmount,
        DualTokenVault vault,
        VaultParameters memory config
    ) internal view returns (uint256) {
        uint256 stableFor1Vault = vault.getRequiredStableTokenAmount(
            1 ether,
            BPS_DENOMINATOR,
            config.vaultTokenAddress,
            config.stableTokenAddress,
            config.chainlinkPriceOracleAddress
        );
        return Math.mulDiv(stableAmount, 1 ether, stableFor1Vault);
    }

    function _getVaultAfterCreation() internal returns (DualTokenVault vault, VaultParameters memory config) {
        test_CreateVault();
        VaultCreationDataWithId memory vaultData = vaultFactory.getVault(1);
        vault = DualTokenVault(payable(vaultData.vaultCreationData.vaultAddress));
        config = vault.getVaultConfig();
    }

    function _getERC20VaultAfterCreation() internal returns (DualTokenVault vault, VaultParameters memory config) {
        test_CreateERC20Vault();
        VaultCreationDataWithId memory vaultData = vaultFactory.getVault(1);
        vault = DualTokenVault(payable(vaultData.vaultCreationData.vaultAddress));
        config = vault.getVaultConfig();
    }
}

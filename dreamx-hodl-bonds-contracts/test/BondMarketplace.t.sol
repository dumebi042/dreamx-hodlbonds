// SPDX-License-Identifier: MIT

pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PaymentSplitterUpgradeable} from "src/paymentSplitter/PaymentSplitterUpgradeable.sol";
import {UnlimitedMintERC20} from "test/mocks/UnlimitedMintERC20.sol";
import {VaultReceiptToken} from "src/vaultReceiptToken/VaultReceiptToken.sol";
import {BondMarketplace} from "src/marketplace/BondMarketplace.sol";
import {Listing} from "src/marketplace/types/MarketplaceTypes.sol";
import {ApprovedTokenSet} from "src/marketplace/types/MarketplaceTypes.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract BondMarketplaceTest is Test {
    uint256 constant BPS_DENOMINATOR = 10_000;

    PaymentSplitterUpgradeable public paymentSplitter;
    UnlimitedMintERC20 public bitcoin;
    VaultReceiptToken public receiptToken;
    BondMarketplace public bondMarketplace;
    uint256[] public approvedTokenSetIds;
    ApprovedTokenSet[] public approvedTokenSet;

    address beef = address(0xBEEF);
    address bob = address(0xB0B);

    address team = makeAddr("team");
    address partner = makeAddr("partner");

    function setUp() public {
        // deploy the stable token
        bitcoin = new UnlimitedMintERC20("Test", "TEST", 18, 1_000_000 ether);

        // deploy the receipt token
        receiptToken = new VaultReceiptToken();

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

        // set up approved token sets
        approvedTokenSetIds.push(1);
        approvedTokenSet.push(
            ApprovedTokenSet({erc1155Address: address(receiptToken), tradeToken: Currency.wrap(address(bitcoin))})
        );
    }

    function test_DeployBondMarketplace() public {
        // deploy the bond marketplace
        bondMarketplace = new BondMarketplace(
            approvedTokenSetIds,
            approvedTokenSet,
            address(paymentSplitter),
            250 // 2.5% fee
        );
    }

    function test_Fail_CreateListing_NotOwner() public {
        test_DeployBondMarketplace();

        uint256 collectionId = 1;

        uint256 price = 1 ether;

        // create a listing
        vm.startPrank(bob);
        vm.expectRevert();
        bondMarketplace.createListing(approvedTokenSetIds[0], collectionId, price, address(0));
        vm.stopPrank();
    }

    function test_CreateListing() public {
        test_DeployBondMarketplace();

        uint256 collectionId = 1;

        // mint a receipt token to beef
        receiptToken.mint(beef, collectionId, 1, "");

        uint256 price = 1 ether;

        // create a listing
        vm.startPrank(beef);
        receiptToken.setApprovalForAll(address(bondMarketplace), true);
        bondMarketplace.createListing(approvedTokenSetIds[0], collectionId, price, address(0));
        vm.stopPrank();

        Listing memory listing = bondMarketplace.getListing(1);
        assertEq(listing.collectionId, collectionId);
        assertEq(listing.price, price);
        assertEq(listing.seller, beef);
    }

    function test_Fail_PurchaseListing_InsufficientFunds() public {
        test_CreateListing();

        uint256 collectionId = 1;

        // purchase the listing
        vm.startPrank(bob);
        vm.expectRevert();
        bondMarketplace.purchase(collectionId);
        vm.stopPrank();
    }

    function test_Fail_PurchaseListing_WrongBuyer() public {
        test_DeployBondMarketplace();

        uint256 listingId = 1;
        uint256 collectionId = 1;

        // mint a receipt token to beef
        receiptToken.mint(beef, listingId, collectionId, "");

        uint256 price = 1 ether;

        // create a private listing for bob's address
        vm.startPrank(beef);
        receiptToken.setApprovalForAll(address(bondMarketplace), true);
        bondMarketplace.createListing(approvedTokenSetIds[0], listingId, price, bob);
        vm.stopPrank();

        // mint bitcoin to another address
        address alice = makeAddr("alice");
        bitcoin.mint(alice, price);

        // purchase the listing
        vm.startPrank(alice);
        bitcoin.approve(address(bondMarketplace), price);
        vm.expectRevert();
        bondMarketplace.purchase(listingId);
        vm.stopPrank();
    }

    function test_PurchaseListing() public {
        test_CreateListing();

        uint256 collectionId = 1;
        uint256 price = 1 ether;

        // mint bitcoin to bob
        bitcoin.mint(bob, price);

        // purchase the listing
        vm.startPrank(bob);
        bitcoin.approve(address(bondMarketplace), price);
        bondMarketplace.purchase(collectionId);
        vm.stopPrank();

        // verify ownership
        assertEq(receiptToken.balanceOf(bob, collectionId), 1);
    }

    function test_Fail_CancelListing_NotSeller() public {
        test_CreateListing();

        uint256 collectionId = 1;

        // cancel the listing
        vm.startPrank(bob);
        vm.expectRevert();
        bondMarketplace.cancelListing(collectionId);
        vm.stopPrank();
    }

    function test_CancelListing() public {
        test_CreateListing();

        uint256 collectionId = 1;

        // cancel the listing
        vm.startPrank(beef);
        bondMarketplace.cancelListing(collectionId);
        vm.stopPrank();

        // verify ownership
        assertEq(receiptToken.balanceOf(beef, collectionId), 1);
    }
}

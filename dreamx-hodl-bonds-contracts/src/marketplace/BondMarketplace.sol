// SPDX-License-Identifier: MIT

pragma solidity 0.8.30;

import {IERC1155Receiver} from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import {ERC1155MarketplaceBase} from "src/marketplace/ERC1155MarketplaceBase.sol";
import {Listing} from "src/marketplace/types/MarketplaceTypes.sol";
import {ApprovedTokenSet} from "src/marketplace/types/MarketplaceTypes.sol";

/// @title ERC1155 Marketplace for Bond Tokens
contract BondMarketplace is ERC1155MarketplaceBase {
    constructor(
        uint256[] memory _initialTokenSetIds,
        ApprovedTokenSet[] memory _initialTokenSets,
        address _feeRecipientAddress,
        uint256 _cut
    ) ERC1155MarketplaceBase(_initialTokenSetIds, _initialTokenSets, _feeRecipientAddress, _cut) {}

    /**
     * @notice Receives native tokens sent to the vault
     */
    receive() external payable {}

    /**
     * @notice Creates new listing.
     * @param _tokenSetId - ID of token set to list.
     * @param _collectionId - ID of token to list, sender must be owner.
     * @param _price - Price of item (in wei).
     * @param _buyer - Address of buyer, or address(0) for open listing.
     */
    function createListing(
        uint256 _tokenSetId,
        uint256 _collectionId,
        uint256 _price,
        address _buyer
    ) external override {
        _escrow(msg.sender, _tokenSetId, _collectionId);
        _addListing(Listing(_tokenSetId, _collectionId, msg.sender, _price, uint64(block.timestamp), _buyer));
    }

    /**
     * @notice Purchases a listing.
     * @param _listingId - ID of listing to purchase.
     */
    function purchase(uint256 _listingId) public override {
        Listing memory listing = listings[_listingId];

        _purchase(msg.sender, _listingId);
        _transfer(msg.sender, listing.tokenSetId, listing.collectionId);
    }

    /**
     * @notice Cancels a listing.
     * Returns the NFT to original owner.
     * @param _listingId - ID of listing to cancel.
     */
    function cancelListing(uint256 _listingId) external override {
        Listing memory listing = listings[_listingId];

        _cancelListing(listing.seller, _listingId, listing.tokenSetId, listing.collectionId);
        _transfer(listing.seller, listing.tokenSetId, listing.collectionId);
    }

    /**
     * @dev See {IERC1155Receiver-onERC1155Received}.
     */
    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        return IERC1155Receiver.onERC1155Received.selector;
    }

    /**
     * @dev See {IERC1155Receiver-onERC1155BatchReceived}.
     */
    function onERC1155BatchReceived(
        address,
        address,
        uint256[] calldata,
        uint256[] calldata,
        bytes calldata
    ) external pure returns (bytes4) {
        return IERC1155Receiver.onERC1155BatchReceived.selector;
    }
}

// SPDX-License-Identifier: MIT

pragma solidity 0.8.30;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {IERC1155Receiver} from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {Listing} from "./types/MarketplaceTypes.sol";
import {IERC1155MarketplaceEvents} from "./interfaces/IERC1155MarketplaceEvents.sol";
import {ApprovedTokenSet} from "./types/MarketplaceTypes.sol";

/// @title MarketplaceBase for ERC1155 non-fungible tokens.
abstract contract ERC1155MarketplaceBase is AccessControl, IERC1155Receiver, IERC1155MarketplaceEvents {
    /// CONSTANTS ///
    uint256 constant BPS_DENOMINATOR = 10_000;

    /// ROLES ///
    bytes32 public constant MODERATOR_ROLE = keccak256("MODERATOR_ROLE");

    /// CONTRACTS ///
    mapping(uint256 => ApprovedTokenSet) public approvedTokenSets;
    uint256[] public approvedTokenSetIds;

    /// STATE ///
    // Cut owner takes on each auction, measured in basis points (1/100 of a percent).
    // Values 0-10,000 map to 0%-100%
    uint256 public ownerCut;

    mapping(uint256 => Listing) public listings;

    // Map from collection ID to their corresponding listing.
    mapping(uint256 => mapping(uint256 => uint256)) tokenSetIdAndCollectionIdToListingId;
    mapping(address => uint256[]) public userListings;
    mapping(uint256 => uint256) listingAtIndex;

    uint256 public totalListings;
    address public feeRecipientAddress;

    constructor(
        uint256[] memory _initialTokenSetIds,
        ApprovedTokenSet[] memory _initialTokenSets,
        address _feeRecipientAddress,
        uint256 _cut
    ) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MODERATOR_ROLE, msg.sender);

        require(_cut <= 10000);
        ownerCut = _cut;

        feeRecipientAddress = _feeRecipientAddress;

        if (_initialTokenSets.length != _initialTokenSetIds.length) {
            revert ArrayLengthMismatch(_initialTokenSetIds.length, _initialTokenSets.length);
        }

        if (_initialTokenSets.length == 0) {
            revert ZeroSetsProvided();
        }

        approvedTokenSetIds = _initialTokenSetIds;
        for (uint256 i = 0; i < _initialTokenSets.length; i++) {
            _setApprovedTokenSet(_initialTokenSetIds[i], _initialTokenSets[i]);
        }
    }

    /**
     * @dev Creates and begins a new listing. This can either escrow or not depending on implementation
     * but should at the very least call _addListing and check ownership
     * @param _tokenSetId - ID of approved token set to use.
     * @param _collectionId - ID of token to list, sender must be owner.
     * @param _price - Price of item (in wei).
     * @param _buyer - The person who can win, if private. 0 for anyone.
     */
    function createListing(uint256 _tokenSetId, uint256 _collectionId, uint256 _price, address _buyer) external virtual;

    /**
     * @dev Purchases a listing, completing the purchase if enough tokens are supplied in return.
     * @param _listingId - ID of the listing to purchase.
     */
    function purchase(uint256 _listingId) public virtual;

    /**
     * @dev Cancels a listing that hasn't been purchased yet.
     *  Returns the NFT to original owner.
     * @param _listingId - ID of listing to cancel.
     */
    function cancelListing(uint256 _listingId) external virtual;

    /**
     * @notice Sets an approved token set
     * @param _tokenSetId ID of the token set to approve
     * @param _approvedTokenSet Approved token set configuration
     */
    function setApprovedTokenSet(
        uint256 _tokenSetId,
        ApprovedTokenSet memory _approvedTokenSet
    ) external onlyRole(MODERATOR_ROLE) {
        _setApprovedTokenSet(_tokenSetId, _approvedTokenSet);
    }

    /**
     * @notice Sets multiple approved token set IDs at once
     * @param _tokenSetIds Array of token set IDs
     */
    function setApprovedTokenSetIds(uint256[] memory _tokenSetIds) external onlyRole(MODERATOR_ROLE) {
        approvedTokenSetIds = _tokenSetIds;
    }

    /**
     * @notice Sets multiple approved token sets at once
     * @dev warning: this will overwrite all existing approved token sets
     * @param _tokenSetIds Array of token set IDs
     * @param _approvedTokenSets Array of approved token sets
     */
    function setApprovedTokenSets(
        uint256[] memory _tokenSetIds,
        ApprovedTokenSet[] memory _approvedTokenSets
    ) external onlyRole(MODERATOR_ROLE) {
        if (_tokenSetIds.length != _approvedTokenSets.length) {
            revert ArrayLengthMismatch(_tokenSetIds.length, _approvedTokenSets.length);
        }

        delete approvedTokenSetIds;
        approvedTokenSetIds = _tokenSetIds;

        for (uint256 i = 0; i < _tokenSetIds.length; i++) {
            _setApprovedTokenSet(_tokenSetIds[i], _approvedTokenSets[i]);
        }
    }

    /**
     * @notice Returns listing info for an NFT on sale.
     * @param _listingId - ID of listing.
     */
    function getListing(uint256 _listingId) public view returns (Listing memory) {
        Listing storage listing = listings[_listingId];

        if (listing.seller == address(0)) {
            revert NotOnSale(listing.collectionId);
        }

        return listing;
    }

    /**
     * @notice Returns an array of listings for the given listing IDs.
     * @param _listingIds - array of listing IDs.
     */
    function getListings(uint256[] memory _listingIds) public view returns (Listing[] memory) {
        Listing[] memory listingsArr = new Listing[](_listingIds.length);
        for (uint256 i; i < _listingIds.length; i++) {
            listingsArr[i] = getListing(_listingIds[i]);
        }

        return listingsArr;
    }

    /**
     * @notice Returns auction info for an NFT on auction.
     * @param _tokenSetId - ID of approved token set.
     * @param _collectionId - ID of NFT on auction.
     */
    function getListing(uint256 _tokenSetId, uint256 _collectionId) public view returns (Listing memory) {
        uint256 listingId = tokenSetIdAndCollectionIdToListingId[_tokenSetId][_collectionId];

        if (listingId == 0) {
            revert ZeroId();
        }

        Listing storage listing = listings[listingId];
        return listing;
    }

    /**
     * @notice Returns an array of listings for the given token set IDs and collection IDs.
     * @param _tokenSetId - array of token set IDs.
     * @param _collectionIds - array of collection IDs.
     */
    function getListings(
        uint256[] memory _tokenSetId,
        uint256[] memory _collectionIds
    ) public view returns (Listing[] memory) {
        if (_collectionIds.length != _tokenSetId.length) {
            revert ArrayLengthMismatch(_collectionIds.length, _tokenSetId.length);
        }
        Listing[] memory listingsArr = new Listing[](_collectionIds.length);
        for (uint256 i; i < _collectionIds.length; i++) {
            listingsArr[i] = getListing(_tokenSetId[i], _collectionIds[i]);
        }
        return listingsArr;
    }

    /**
     * @notice returns the account's listing IDs
     * @param _address - address to get listing IDs for
     */
    function getUserListingIds(address _address) public view returns (uint256[] memory) {
        return userListings[_address];
    }

    /**
     * @notice returns the account's listings
     * @param _address - address to get listings for
     */
    function getUserListings(address _address) public view returns (Listing[] memory) {
        uint256[] memory listingIds = userListings[_address];
        Listing[] memory listingsArr = new Listing[](listingIds.length);
        for (uint256 i; i < listingIds.length; i++) {
            listingsArr[i] = getListing(listingIds[i]);
        }
        return listingsArr;
    }

    /**
     * @notice Escrows an NFT from a user to this contract.
     * @param _owner - Address of current owner of NFT.
     * @param _tokenSetId - ID of approved token set to use.
     * @param _collectionId - ID of token to escrow.
     */
    function _escrow(address _owner, uint256 _tokenSetId, uint256 _collectionId) internal {
        IERC1155(approvedTokenSets[_tokenSetId].erc1155Address).safeTransferFrom(
            _owner,
            address(this),
            _collectionId,
            1,
            ""
        );
    }

    /**
     * @notice Transfers an escrowed NFT from this contract to a receiver.
     * @param _receiver - Address to transfer the NFT to.
     * @param _tokenSetId - ID of approved token set to use.
     * @param _collectionId - ID of token to transfer.
     */
    function _transfer(address _receiver, uint256 _tokenSetId, uint256 _collectionId) internal {
        IERC1155(approvedTokenSets[_tokenSetId].erc1155Address).safeTransferFrom(
            address(this),
            _receiver,
            _collectionId,
            1,
            ""
        );
    }

    /**
     * @notice Adds a new listing to the marketplace.
     * @param _listing - Listing to add.
     */
    function _addListing(Listing memory _listing) internal {
        // enforce the tokenSet is aproved
        ApprovedTokenSet memory tokenSet = approvedTokenSets[_listing.tokenSetId];
        if (tokenSet.erc1155Address == address(0)) {
            revert InvalidTokenSetId();
        }

        // Enforce prices are not 0
        if (_listing.price == 0) {
            revert InvalidPrice();
        }

        // Make sure it's not already listed.
        if (tokenSetIdAndCollectionIdToListingId[_listing.tokenSetId][_listing.collectionId] > 0) {
            revert AlreadyOnSale(_listing.collectionId);
        }

        totalListings += 1;
        uint256 listingId = totalListings;

        listings[listingId] = _listing;

        tokenSetIdAndCollectionIdToListingId[_listing.tokenSetId][_listing.collectionId] = listingId;

        listingAtIndex[_listing.collectionId] = userListings[msg.sender].length;
        userListings[msg.sender].push(_listing.collectionId);

        emit ListingCreated(
            listingId,
            msg.sender,
            _listing.tokenSetId,
            _listing.collectionId,
            _listing.price,
            _listing.buyer
        );
    }

    /**
     * @notice Cancels a listing that hasn't been completed yet.
     * Returns the NFT to original owner.
     * @param _seller - Address of the seller.
     * @param _listingId - ID of listing to cancel.
     * @param _tokenSetId - ID of approved token set.
     * @param _collectionId - ID of token to cancel listing for.
     */
    function _cancelListing(address _seller, uint256 _listingId, uint256 _tokenSetId, uint256 _collectionId) internal {
        if (_seller == address(0)) {
            revert NotOnSale(_collectionId);
        }

        if (msg.sender != _seller) {
            revert NotOwner(msg.sender);
        }

        _removeListing(_seller, _listingId, _tokenSetId, _collectionId);

        emit ListingCancelled(_listingId, _tokenSetId, _collectionId);
    }

    /**
     * @notice Sets an approved token set
     * @param _tokenSetId ID of the token set to approve
     * @param _approvedTokenSet Approved token set configuration
     */
    function _setApprovedTokenSet(uint256 _tokenSetId, ApprovedTokenSet memory _approvedTokenSet) internal {
        if (_approvedTokenSet.erc1155Address == address(0)) {
            revert InvalidERC1155Address();
        }

        approvedTokenSets[_tokenSetId] = _approvedTokenSet;

        emit ApprovedTokenSetSet(
            _tokenSetId,
            _approvedTokenSet.erc1155Address,
            Currency.unwrap(_approvedTokenSet.tradeToken)
        );
    }

    /**
     * @notice Purchases a listing, completing the purchase if enough tokens are supplied in return.
     * @param _buyer - Address of the buyer.
     * @param _listingId - ID of the listing to purchase.
     */
    function _purchase(address _buyer, uint256 _listingId) internal virtual returns (uint256) {
        Listing memory listing = listings[_listingId];

        if (_listingId == 0) {
            revert NotOnSale(_listingId);
        }

        ApprovedTokenSet memory tokenSet = approvedTokenSets[listing.tokenSetId];

        // If this is a private sale, make sure it only allows the address given.
        if (listing.buyer != address(0) && listing.buyer != _buyer) {
            revert IncorrectPrivateSaleBuyer(listing.buyer, _buyer);
        }

        // Remove the listing before we do the transfer.
        _removeListing(listing.seller, _listingId, listing.tokenSetId, listing.collectionId);

        // Calculate the marketplace's cut.
        // (NOTE: _computeCut() is guaranteed to return a
        // value <= price, so this subtraction can't go negative.)
        uint256 marketplaceCut = _computeCut(listing.price);
        uint256 sellerProceeds = listing.price - marketplaceCut;

        // Transfer the tokens to the ERC1155 owner, minus the fee.
        _settlePayment(tokenSet.tradeToken, _buyer, listing.seller, sellerProceeds);

        // Transfer the protocol's cut to the fee recipient.
        _settlePayment(tokenSet.tradeToken, _buyer, feeRecipientAddress, marketplaceCut);
        emit FeeCollected(feeRecipientAddress, Currency.unwrap(tokenSet.tradeToken), marketplaceCut);

        emit ListingPurchased(_listingId, listing.tokenSetId, listing.collectionId, listing.price, _buyer);

        return listing.price;
    }

    /**
     * @notice Computes the marketplace's cut of a sale.
     * @param _price - Sale price of the item.
     * @return The marketplace's cut.
     */
    function _computeCut(uint256 _price) internal view returns (uint256) {
        return (_price * ownerCut) / BPS_DENOMINATOR;
    }

    /**
     * @notice Removes a listing from the marketplace.
     * @param _account - Address of the seller.
     * @param _listingId - ID of listing to remove.
     * @param _tokenSetId - ID of approved token set.
     * @param _collectionId - ID of token to remove listing for.
     */
    function _removeListing(address _account, uint256 _listingId, uint256 _tokenSetId, uint256 _collectionId) internal {
        // We need to delete the item from the array for the user.
        // Get the current index of that item.
        uint256 currentIndex = listingAtIndex[_collectionId];

        // Put the last item in the array at that index.
        userListings[_account][currentIndex] = userListings[_account][userListings[_account].length - 1];

        // Remove the last element from the array.
        userListings[_account].pop();

        // Update the listingAtIndex record for that listing that was moved.
        if (userListings[_account].length > currentIndex) {
            listingAtIndex[userListings[_account][currentIndex]] = currentIndex;
        }

        delete tokenSetIdAndCollectionIdToListingId[_tokenSetId][_collectionId];
        delete listings[_listingId];
    }

    /**
     * @notice Settles payment from one address to another in either native token or ERC20.
     * @param _currency - Currency to use for payment.
     * @param _from - Address to take payment from.
     * @param _to - Address to send payment to.
     * @param _amount - Amount to pay.
     */
    function _settlePayment(Currency _currency, address _from, address _to, uint256 _amount) internal {
        if (_currency.isAddressZero()) {
            if (msg.value != _amount) {
                revert IncorrectNativeTokenAmountSent(_amount, msg.value);
            }
        } else {
            if (msg.value > 0) {
                revert NativeTokenNotAccepted();
            }
            if (!IERC20(Currency.unwrap(_currency)).transferFrom(_from, _to, _amount)) {
                revert PaymentTransferFailed();
            }
        }
    }
}

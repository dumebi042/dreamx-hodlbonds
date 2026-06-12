// SPDX-License-Identifier: MIT

pragma solidity 0.8.30;

interface IERC1155MarketplaceEvents {
    event ListingCreated(
        uint256 listingId,
        address indexed owner,
        uint256 indexed tokenSetId,
        uint256 indexed collectionId,
        uint256 price,
        address buyer
    );

    event ListingPurchased(
        uint256 indexed listingId,
        uint256 indexed tokenSetId,
        uint256 collectionId,
        uint256 totalPrice,
        address indexed buyer
    );

    event ListingCancelled(uint256 listingId, uint256 tokenSetId, uint256 collectionId);

    event ApprovedTokenSetSet(uint256 tokenSetId, address erc1155Address, address tradeTokenAddress);

    event FeeCollected(address indexed to, address indexed token, uint256 amount);

    error NotOwner(address caller);
    error NotSeller(address caller);
    error NotOnSale(uint256 collectionId);
    error AlreadyOnSale(uint256 collectionId);
    error IncorrectPrivateSaleBuyer(address buyer, address caller);
    error InvalidPrice();
    error ZeroId();
    error IncorrectNativeTokenAmountSent(uint256 expectedAmount, uint256 actualAmount);
    error NativeTokenNotAccepted();
    error PaymentTransferFailed();
    error InvalidTokenSetId();
    error ArrayLengthMismatch(uint256 arrayLength1, uint256 arrayLength2);
    error ZeroSetsProvided();
    error InvalidERC1155Address();
}

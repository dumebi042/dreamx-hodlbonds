// SPDX-License-Identifier: MIT

pragma solidity 0.8.30;

import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";

struct Listing {
    uint256 tokenSetId;
    uint256 collectionId;
    address seller;
    uint256 price;
    uint64 startedAt;
    address buyer; // If the winner is set from the start, that means it is a private sale.
}

struct ApprovedTokenSet {
    address erc1155Address;
    Currency tradeToken;
}

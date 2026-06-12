// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.4.0
pragma solidity 0.8.30;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {ERC1155Burnable} from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Burnable.sol";
import {ERC1155Supply} from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";

/**
 * @title VaultReceiptToken
 * @author Drew Kerby
 * @notice ERC1155 token representing ownership receipts for dual-token vault bonds
 * @dev This contract mints receipt tokens when bonds are issued and burns them upon redemption.
 *      Each vault has a unique token ID, and holders can own one receipt token per vault.
 *      The contract uses role-based access control to restrict minting to authorized vault contracts.
 */
contract VaultReceiptToken is ERC1155, AccessControl, ERC1155Burnable, ERC1155Supply {
    bytes32 public constant MODERATOR_ROLE = keccak256("MODERATOR_ROLE");
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    uint256 public constant MAX_SUPPLY_PER_ID = 1;

    error InvalidAmount(uint256 amount);
    error TokenAlreadyMinted(uint256 id);
    error InvalidBatchLength(uint256 idsLength, uint256 amountsLength);

    /**
     * @notice Constructs the receipt token contract
     */
    constructor() ERC1155("") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
        _grantRole(MODERATOR_ROLE, msg.sender);
    }

    /**
     * @notice Sets the URI for token metadata
     * @param newuri The new URI string
     */
    function setURI(string memory newuri) external onlyRole(MODERATOR_ROLE) {
        _setURI(newuri);
    }

    /**
     * @notice Mints receipt tokens to an account
     * @param account The address to mint tokens to
     * @param id The token ID (vault ID)
     * @param amount The amount of tokens to mint
     * @param data Additional data to pass to the mint function
     */
    function mint(address account, uint256 id, uint256 amount, bytes memory data) external onlyRole(MINTER_ROLE) {
        _enforceSupplyConstraints(id, amount);

        _mint(account, id, amount, data);
    }

    /**
     * @notice Mints multiple receipt tokens in a batch
     * @param to The address to mint tokens to
     * @param ids Array of token IDs (vault IDs)
     * @param amounts Array of amounts to mint for each ID
     * @param data Additional data to pass to the mint function
     */
    function mintBatch(
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) external onlyRole(MINTER_ROLE) {
        // Ensure that only one token ID is minted in the batch and that the lengths of ids and amounts match
        if (ids.length != 1 || ids.length != amounts.length) {
            revert InvalidBatchLength(ids.length, amounts.length);
        }

        _enforceSupplyConstraints(ids[0], amounts[0]);

        _mintBatch(to, ids, amounts, data);
    }

    /**
     * @notice Checks if the contract supports a given interface
     * @param interfaceId The interface identifier to check
     * @return True if the interface is supported
     */
    function supportsInterface(bytes4 interfaceId) public view override(ERC1155, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    /**
     * @notice Internal function to update token balances and supply
     * @param from The address tokens are transferred from
     * @param to The address tokens are transferred to
     * @param ids Array of token IDs
     * @param values Array of amounts for each token ID
     */
    function _update(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values
    ) internal override(ERC1155, ERC1155Supply) {
        super._update(from, to, ids, values);
    }

    /*
     * @notice Internal function to enforce supply constraints for minting
     * @param id The token ID being minted
     * @param amount The amount of tokens being minted
     */
    function _enforceSupplyConstraints(uint256 id, uint256 amount) internal view {
        if (amount > MAX_SUPPLY_PER_ID) {
            revert InvalidAmount(amount);
        }

        if (totalSupply(id) > 0) {
            revert TokenAlreadyMinted(id);
        }
    }
}

// SPDX-License-Identifier: MIT

pragma solidity 0.8.30;

/**
 * @title MerkleTreeHelper
 * @author Drew Kerby
 * @notice Library for Merkle tree operations including leaf generation, root building, and proof construction
 * @dev This library provides utilities for creating Merkle trees from addresses, building Merkle roots,
 *      and generating Merkle proofs for verification. Used for allowlist and authorization checks.
 */
library MerkleTreeHelper {
    /**
     * @notice Generates a Merkle tree leaf from an account address
     * @param _account The account address to generate a leaf for
     * @return hashedVal The hashed leaf value
     */
    function leaf(address _account) internal pure returns (bytes32 hashedVal) {
        assembly {
            // Store address in the lower 20 bytes starting at offset 0x00
            mstore(0x00, _account)

            // Hash 20 bytes starting from offset 0x0c (12 bytes offset)
            hashedVal := keccak256(0x0c, 0x14)
        }
    }
}

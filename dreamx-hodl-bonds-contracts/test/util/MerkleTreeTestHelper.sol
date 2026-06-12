// SPDX-License-Identifier: MIT

pragma solidity 0.8.30;

/**
 * @title MerkleTreeTestHelper
 * @author Drew Kerby
 * @notice Test Helper Library for Merkle tree operations including root building and proof construction
 * @dev This library provides utilities for creating Merkle trees from addresses, building Merkle roots,
 *      and generating Merkle proofs for verification. Used for allowlist and authorization checks.
 */
library MerkleTreeTestHelper {
    /**
     * @notice Hashes a pair of Merkle tree nodes in sorted order
     * @param a First node value
     * @param b Second node value
     * @return The hash of the sorted pair
     */
    function hashPair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
    }

    /**
     * @notice Builds a Merkle root from an array of leaves
     * @param leaves Array of leaf values
     * @return The computed Merkle root
     */
    function buildRoot(bytes32[] memory leaves) internal pure returns (bytes32) {
        require(leaves.length > 0, "no leaves");

        while (leaves.length > 1) {
            uint256 nextLen = (leaves.length + 1) / 2;
            bytes32[] memory next = new bytes32[](nextLen);

            for (uint256 i = 0; i < leaves.length; i += 2) {
                if (i + 1 < leaves.length) {
                    next[i / 2] = hashPair(leaves[i], leaves[i + 1]);
                } else {
                    next[i / 2] = leaves[i];
                }
            }

            leaves = next;
        }

        return leaves[0];
    }

    /**
     * @notice Builds a Merkle proof for a specific leaf at the given index
     * @param leaves Array of all leaf values
     * @param index The index of the leaf to generate a proof for
     * @return proof The Merkle proof array
     */
    function buildProof(bytes32[] memory leaves, uint256 index) internal pure returns (bytes32[] memory proof) {
        require(index < leaves.length, "bad index");

        uint256 depth = 0;
        uint256 n = leaves.length;
        while (n > 1) {
            n = (n + 1) / 2;
            depth++;
        }

        proof = new bytes32[](depth);
        uint256 pos = 0;

        uint256 idx = index;

        while (leaves.length > 1) {
            uint256 pair = idx ^ 1;

            if (pair < leaves.length) {
                proof[pos++] = leaves[pair];
            }

            uint256 nextLen = (leaves.length + 1) / 2;
            bytes32[] memory next = new bytes32[](nextLen);

            for (uint256 i = 0; i < leaves.length; i += 2) {
                if (i + 1 < leaves.length) {
                    next[i / 2] = hashPair(leaves[i], leaves[i + 1]);
                } else {
                    next[i / 2] = leaves[i];
                }
            }

            idx /= 2;
            leaves = next;
        }

        assembly {
            mstore(proof, pos)
        }
    }
}

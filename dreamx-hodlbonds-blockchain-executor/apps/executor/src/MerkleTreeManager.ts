import { SimpleMerkleTree } from "@openzeppelin/merkle-tree"
import { keccak256 } from "ethers"
import log4js, { type Logger } from "log4js"

/**
 * Manages Merkle tree for executor wallet address verification
 * This class is intentionally isolated - it only knows wallet addresses,
 * not seed phrases or wallet management logic
 */
export class MerkleTreeManager {
  logger: Logger = log4js.getLogger("MerkleTreeManager")

  private readonly walletAddresses: string[]
  private readonly merkleTree: SimpleMerkleTree
  private readonly root: string

  /**
   * Create a new MerkleTreeManager
   * @param {string[]} walletAddresses - Array of executor wallet addresses to include in tree
   */
  constructor(walletAddresses: string[]) {
    if (walletAddresses.length === 0) {
      throw new Error("Cannot create Merkle tree with empty wallet addresses")
    }

    // Normalize addresses to lowercase
    this.walletAddresses = walletAddresses.map((addr) => addr.toLowerCase())

    // Build Merkle tree using keccak256(address) as leaves
    // This matches the on-chain implementation for trader role verification
    const leaves = this.walletAddresses.map((addr) => keccak256(addr))
    this.merkleTree = SimpleMerkleTree.of(leaves)
    this.root = this.merkleTree.root

    this.logger.info(`Initialized Merkle tree with ${walletAddresses.length} wallet addresses`, {
      walletCount: walletAddresses.length,
      root: this.root,
    })
  }

  /**
   * Generate a Merkle proof for a given wallet address
   * @param {string} address - The wallet address to generate proof for
   * @return {string[]} Array of proof hashes (bytes32)
   */
  generateProof(address: string): string[] {
    const normalizedAddress = address.toLowerCase()

    if (!this.walletAddresses.includes(normalizedAddress)) {
      this.logger.error(`Address ${address} not found in Merkle tree`, { address })
      throw new Error(`Address ${address} is not a valid executor wallet`)
    }

    try {
      // Get proof using the hashed address as the leaf value
      const hashedAddress = keccak256(normalizedAddress)
      const proof = this.merkleTree.getProof(hashedAddress)

      this.logger.debug(`Generated Merkle proof for address ${address}`, {
        address,
        proofLength: proof.length,
      })

      return proof
    } catch (error) {
      this.logger.error(`Failed to generate Merkle proof for ${address}: ${error}`, { address })
      throw error
    }
  }

  /**
   * Get the Merkle root hash
   * @return {string}
   */
  getRoot(): string {
    return this.root
  }

  /**
   * Verify a proof for a given address
   * @param {string} address - The wallet address to verify
   * @param {string[]} proof - The Merkle proof
   * @return {boolean}
   */
  verifyProof(address: string, proof: string[]): boolean {
    const normalizedAddress = address.toLowerCase()

    try {
      const hashedAddress = keccak256(normalizedAddress)
      return this.merkleTree.verify(hashedAddress, proof)
    } catch (error) {
      this.logger.warn(`Proof verification failed for ${address}: ${error}`, { address })
      return false
    }
  }

  /**
   * Get the list of wallet addresses in the tree (for debugging)
   * @return {string[]}
   */
  getWalletAddresses(): string[] {
    return [...this.walletAddresses] // Return defensive copy
  }
}

import { describe, expect, it } from "vitest"

import { MerkleTreeManager } from "@/MerkleTreeManager"

describe("MerkleTreeManager", () => {
  const testAddresses = [
    "0x742d35cc6634c0532925a3b844bc9e7595f0beb0",
    "0x5b38da6a701c568545dcfcb03fcb875f56beddc4",
    "0xab8483f64d9c6d1ecf9b849ae677dd3315835cb2",
  ]

  describe("constructor", () => {
    it("should create a Merkle tree from wallet addresses", () => {
      const manager = new MerkleTreeManager(testAddresses)

      expect(manager.getRoot()).toBeDefined()
      expect(manager.getRoot()).toMatch(/^0x[a-fA-F0-9]{64}$/)
      expect(manager.getWalletAddresses()).toEqual(testAddresses.map((addr) => addr.toLowerCase()))
    })

    it("should throw error for empty addresses array", () => {
      expect(() => new MerkleTreeManager([])).toThrow(
        "Cannot create Merkle tree with empty wallet addresses",
      )
    })

    it("should normalize addresses to lowercase", () => {
      const mixedCaseAddresses = [
        "0x742D35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        "0x5B38Da6a701c568545dCfcB03FcB875f56beDdc4",
      ]

      const manager = new MerkleTreeManager(mixedCaseAddresses)
      const normalized = manager.getWalletAddresses()

      expect(normalized).toEqual(mixedCaseAddresses.map((addr) => addr.toLowerCase()))
    })
  })

  describe("generateProof", () => {
    it("should generate a valid Merkle proof for an address in the tree", () => {
      const manager = new MerkleTreeManager(testAddresses)
      const proof = manager.generateProof(testAddresses[0]!)

      expect(Array.isArray(proof)).toBe(true)
      expect(proof.length).toBeGreaterThan(0)
      expect(proof.every((p) => typeof p === "string")).toBe(true)
      expect(proof.every((p) => p.startsWith("0x"))).toBe(true)
    })

    it("should handle case-insensitive address lookup", () => {
      const manager = new MerkleTreeManager(testAddresses)
      const upperCaseAddress = testAddresses[1]!.toUpperCase()

      const proof = manager.generateProof(upperCaseAddress)

      expect(proof).toBeDefined()
      expect(Array.isArray(proof)).toBe(true)
    })

    it("should throw error for address not in tree", () => {
      const manager = new MerkleTreeManager(testAddresses)
      const invalidAddress = "0x0000000000000000000000000000000000000000"

      expect(() => manager.generateProof(invalidAddress)).toThrow(
        `Address ${invalidAddress} is not a valid executor wallet`,
      )
    })

    it("should generate different proofs for different addresses", () => {
      const manager = new MerkleTreeManager(testAddresses)

      const proof1 = manager.generateProof(testAddresses[0]!)
      const proof2 = manager.generateProof(testAddresses[1]!)

      // Proofs should be different (unless tree has only 2 elements and they're siblings)
      // oxlint-disable-next-line jest/no-conditional-in-test
      if (testAddresses.length > 2) {
        // oxlint-disable-next-line jest/no-conditional-expect
        expect(proof1).not.toEqual(proof2)
      }
    })

    it("should handle errors during proof generation", () => {
      const manager = new MerkleTreeManager(testAddresses)

      // Mock the merkleTree.getProof to throw an error
      const originalGetProof = manager["merkleTree"].getProof
      manager["merkleTree"].getProof = () => {
        throw new Error("Mock proof generation error")
      }

      expect(() => manager.generateProof(testAddresses[0]!)).toThrow("Mock proof generation error")

      // Restore original method
      manager["merkleTree"].getProof = originalGetProof
    })
  })

  describe("verifyProof", () => {
    it("should verify a valid proof", () => {
      const manager = new MerkleTreeManager(testAddresses)
      const address = testAddresses[0]!
      const proof = manager.generateProof(address)

      const isValid = manager.verifyProof(address, proof)

      expect(isValid).toBe(true)
    })

    it("should reject an invalid proof", () => {
      const manager = new MerkleTreeManager(testAddresses)
      const address = testAddresses[0]!
      const invalidProof = ["0x" + "0".repeat(64)]

      const isValid = manager.verifyProof(address, invalidProof)

      expect(isValid).toBe(false)
    })

    it("should reject proof for wrong address", () => {
      const manager = new MerkleTreeManager(testAddresses)
      const proof = manager.generateProof(testAddresses[0]!)

      const isValid = manager.verifyProof(testAddresses[1]!, proof)
      expect(isValid).toBe(false)
    })

    it("should handle case-insensitive verification", () => {
      const manager = new MerkleTreeManager(testAddresses)
      const address = testAddresses[0]!
      const proof = manager.generateProof(address)
      const upperCaseAddress = address.toUpperCase()

      const isValid = manager.verifyProof(upperCaseAddress, proof)

      expect(isValid).toBe(true)
    })

    it("should return false when verification throws an error", () => {
      const manager = new MerkleTreeManager(testAddresses)
      const address = testAddresses[0]!

      // Mock the merkleTree.verify to throw an error
      const originalVerify = manager["merkleTree"].verify
      manager["merkleTree"].verify = () => {
        throw new Error("Mock verification error")
      }

      const isValid = manager.verifyProof(address, ["0x123"])

      expect(isValid).toBe(false)

      // Restore original method
      manager["merkleTree"].verify = originalVerify
    })
  })

  describe("getRoot", () => {
    it("should return consistent root for same addresses", () => {
      const manager1 = new MerkleTreeManager(testAddresses)
      const manager2 = new MerkleTreeManager(testAddresses)

      expect(manager1.getRoot()).toBe(manager2.getRoot())
    })

    it("should return different root for different addresses", () => {
      const manager1 = new MerkleTreeManager(testAddresses)
      const manager2 = new MerkleTreeManager([testAddresses[0]!, testAddresses[1]!])

      expect(manager1.getRoot()).not.toBe(manager2.getRoot())
    })

    it("should return same root regardless of address order", () => {
      const manager1 = new MerkleTreeManager(testAddresses)
      const reversed = [...testAddresses].toReversed()
      const manager2 = new MerkleTreeManager(reversed)

      // SimpleMerkleTree sorts leaves internally, so order shouldn't affect the root
      expect(manager1.getRoot()).toBe(manager2.getRoot())
    })
  })

  describe("integration", () => {
    it("should match on-chain verification pattern", () => {
      // This test verifies the implementation matches the pattern:
      // leaves = addresses.map(addr => keccak256(addr))
      // tree = SimpleMerkleTree.of(leaves)
      // proof = tree.getProof(keccak256(executorAddress))

      const manager = new MerkleTreeManager(testAddresses)

      for (const address of testAddresses) {
        const proof = manager.generateProof(address)
        const isValid = manager.verifyProof(address, proof)

        expect(isValid).toBe(true)
        // With 3 addresses, proofs should be non-empty
        expect(proof.length).toBeGreaterThan(0)
      }
    })

    it("should generate empty proof for single address tree", () => {
      // When there's only one address, the proof should be empty
      // because the address itself is the root
      const singleAddress = ["0x742d35cc6634c0532925a3b844bc9e7595f0beb0"]
      const manager = new MerkleTreeManager(singleAddress)

      const proof = manager.generateProof(singleAddress[0]!)

      expect(proof).toEqual([])
      expect(manager.verifyProof(singleAddress[0]!, proof)).toBe(true)
    })
  })
})

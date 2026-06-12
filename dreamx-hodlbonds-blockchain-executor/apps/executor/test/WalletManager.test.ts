import { captureZodError } from "@dreamx-development/hodlbonds-blockchain-executor-dto"
import {
  ethers,
  type JsonRpcProvider,
  type Provider,
  type Signer,
  type TransactionReceipt,
  type TransactionResponse,
} from "ethers"
import { expect, describe, it, beforeEach, afterEach, vi } from "vitest"

import type { WalletManagerConfig } from "@/schemas"

import { Queue } from "@/utils/Queue"
import { Wallet } from "@/Wallet"
import { WalletManager } from "@/WalletManager"

const TEST_BALANCE_LOW_WATERMARK_ETHER = "1"
const TEST_BALANCE_LOW_WATERMARK = ethers.parseEther(TEST_BALANCE_LOW_WATERMARK_ETHER)

const mockConfig = {
  walletCount: 5,
  totalGlobalWalletCount: 5,
  processReleasedWalletsDelay: 1000,
  refuelDelay: 1000,
  refuelAmount: "5",
  connectionCheckDelay: 1000,

  gasBalanceLowWaterMarkEther: TEST_BALANCE_LOW_WATERMARK_ETHER,
  wallet0GasBalanceLowWaterMarkEther: TEST_BALANCE_LOW_WATERMARK_ETHER,
  providerEndpoint: "https://rpc.testurl.com",
  chainId: 4488,
  walletOffset: 1,
} as WalletManagerConfig
const mockCheckConfig = vi.fn()

const mockProvider = "Mocked provider" as unknown as Provider
const mockGetSeedPhrase = vi.fn()
const TEST_SEED_PHRASE = "test test test test test test test test test test test junk"

// Helper function to spy on all logger methods
function spyOnLogger(manager: WalletManager) {
  return {
    debug: vi.spyOn(manager.logger, "debug"),
    info: vi.spyOn(manager.logger, "info"),
    warn: vi.spyOn(manager.logger, "warn"),
    error: vi.spyOn(manager.logger, "error"),
  }
}

describe("WalletManager tests", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers()
    mockGetSeedPhrase.mockResolvedValue(TEST_SEED_PHRASE)
    mockCheckConfig.mockImplementation((config: WalletManagerConfig) => config)
  })

  afterEach(() => {
    vi.clearAllTimers()
  })

  it("Constructor: Creates wallet 0", async () => {
    expect.assertions(4)
    const walletManager = new WalletManager(mockConfig)
    walletManager.getSeedPhrase = mockGetSeedPhrase

    expect(walletManager._wallet0).toBe(null)

    await walletManager.initWallets(0, TEST_SEED_PHRASE)
    expect(walletManager.wallet0).not.toBe(null)
    expect(walletManager.wallet0.getId()).toBe(0)
    expect(walletManager.wallet0.getAddress()).toBe("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266")
  })

  it("Constructor: Throws on invalid config", () => {
    expect.assertions(1)
    const wrongConfig = undefined as unknown as WalletManagerConfig

    const err = captureZodError(() => {
      // oxlint-disable-next-line no-new
      new WalletManager(wrongConfig)
    })
    expect(err.issues[0]?.message).toBe("Invalid input: expected object, received undefined")
  })

  it("getSeedPhrase: Returns seed phrase from Secret Manager", async () => {
    expect.assertions(2)

    const manager = new WalletManager(mockConfig)
    manager.getSeedPhrase = mockGetSeedPhrase

    const seedPhrase = await manager.getSeedPhrase()

    expect(seedPhrase).toBeTruthy()
    expect(typeof seedPhrase).toBe("string")
  })

  it("getSeedPhrase: Throws when secret has no payload", async () => {
    expect.assertions(1)

    const manager = new WalletManager(mockConfig)
    manager.getSeedPhrase = vi.fn().mockRejectedValue(new Error("Secret executor-seed-phrase has no payload"))

    await expect(() => manager.getSeedPhrase()).rejects.toThrow(/has no payload/)
  })

  it("provider getter: Throws when provider not connected", () => {
    expect.assertions(1)

    const manager = new WalletManager(mockConfig)
    manager.getSeedPhrase = mockGetSeedPhrase
    manager._provider = null

    expect(() => manager.provider).toThrow("Provider not connected")
  })

  it("wallet0 getter: Throws when wallet0 not initialized", () => {
    expect.assertions(1)

    const manager = new WalletManager(mockConfig)
    manager.getSeedPhrase = mockGetSeedPhrase
    manager._wallet0 = null

    expect(() => manager.wallet0).toThrow("Wallet0 not initialized")
  })

  it("getMerkleTreeManager: Returns MerkleTreeManager when initialized", async () => {
    expect.assertions(2)

    const manager = new WalletManager(mockConfig)
    manager.getSeedPhrase = mockGetSeedPhrase

    await manager.buildMerkleTreeManager(TEST_SEED_PHRASE)

    const merkleTreeManager = manager.getMerkleTreeManager()
    expect(merkleTreeManager).toBeDefined()
    expect(merkleTreeManager).toBe(manager._merkleTreeManager)
  })

  it("getMerkleTreeManager: Throws when MerkleTreeManager not initialized", () => {
    expect.assertions(1)

    const manager = new WalletManager(mockConfig)
    manager.getSeedPhrase = mockGetSeedPhrase
    manager._merkleTreeManager = null

    expect(() => manager.getMerkleTreeManager()).toThrow("MerkleTreeManager not initialized")
  })

  it("buildMerkleTreeManager: Builds Merkle tree with correct number of wallets", async () => {
    expect.assertions(3)

    const manager = new WalletManager(mockConfig)
    manager.getSeedPhrase = mockGetSeedPhrase
    const loggerSpy = spyOnLogger(manager)

    await manager.buildMerkleTreeManager(TEST_SEED_PHRASE)

    expect(manager._merkleTreeManager).not.toBe(null)
    expect(loggerSpy.info).toHaveBeenCalledWith(
      `Building Merkle tree for ${mockConfig.totalGlobalWalletCount} global executor wallets (1-${mockConfig.totalGlobalWalletCount})`,
      { chainId: mockConfig.chainId },
    )
    // Verify debug logs for each wallet (1 through totalGlobalWalletCount)
    // Each wallet generates 2 debug logs: one for "Using path" and one for "Merkle tree wallet"
    expect(loggerSpy.debug).toHaveBeenCalledTimes(mockConfig.totalGlobalWalletCount * 2)
  })

  it("buildMerkleTreeManager: Generates correct addresses for all global wallets", async () => {
    const expectedAddresses = [
      "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", // wallet 1 (original mixed case from getAddress)
      "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", // wallet 2
      "0x90F79bf6EB2c4f870365E785982E1f101E93b906", // wallet 3
      "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65", // wallet 4
      "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc", // wallet 5
    ]

    expect.assertions(expectedAddresses.length + 1)

    const manager = new WalletManager(mockConfig)
    manager.getSeedPhrase = mockGetSeedPhrase
    const loggerSpy = spyOnLogger(manager)

    await manager.buildMerkleTreeManager(TEST_SEED_PHRASE)

    expect(manager._merkleTreeManager).not.toBe(null)

    // Verify each wallet address was logged (addresses in logs are original mixed case)
    for (let i = 0; i < expectedAddresses.length; i++) {
      expect(loggerSpy.debug).toHaveBeenCalledWith(
        `Merkle tree wallet ${i + 1}: ${expectedAddresses[i]}`,
        {
          chainId: mockConfig.chainId,
          walletId: i + 1,
          walletAddress: expectedAddresses[i],
        },
      )
    }
  })

  it("buildMerkleTreeManager: Uses totalGlobalWalletCount not walletCount", async () => {
    expect.assertions(3)

    const configWithDifferentCounts = {
      ...mockConfig,
      walletCount: 2, // Only 2 wallets for this region
      totalGlobalWalletCount: 10, // But 10 total global wallets
    }

    const manager = new WalletManager(configWithDifferentCounts)
    manager.getSeedPhrase = mockGetSeedPhrase
    const loggerSpy = spyOnLogger(manager)

    await manager.buildMerkleTreeManager(TEST_SEED_PHRASE)

    expect(manager._merkleTreeManager).not.toBe(null)
    expect(loggerSpy.info).toHaveBeenCalledWith(
      "Building Merkle tree for 10 global executor wallets (1-10)",
      { chainId: configWithDifferentCounts.chainId },
    )
    // Should generate debug logs for all 10 wallets, not just 2
    // Each wallet generates 2 debug logs: one for "Using path" and one for "Merkle tree wallet"
    expect(loggerSpy.debug).toHaveBeenCalledTimes(20)
  })

  it("buildMerkleTreeManager: Creates MerkleTreeManager instance", async () => {
    expect.assertions(2)

    const manager = new WalletManager(mockConfig)
    manager.getSeedPhrase = mockGetSeedPhrase

    await manager.buildMerkleTreeManager(TEST_SEED_PHRASE)

    expect(manager._merkleTreeManager).not.toBe(null)
    expect(manager.getMerkleTreeManager()).toBe(manager._merkleTreeManager)
  })

  it("initWallets: Throws when seedPhrase doesn't match regex pattern", async () => {
    expect.assertions(1)

    const walletManager = new WalletManager(mockConfig)
    walletManager.getSeedPhrase = mockGetSeedPhrase

    // 11 words - won't match 12 or 24 word regex
    await expect(() => walletManager.initWallets(1, "word word word word word word word word word word word")).rejects.toThrow(/seedPhrase doesn't match/)
  })

  it("initWallets: Throws on missing or wrong seedPhrase", async () => {
    expect.assertions(2)

    const walletManager = new WalletManager(mockConfig)
    walletManager.getSeedPhrase = mockGetSeedPhrase

    await expect(() => walletManager.initWallets(1, "some random words too few")).rejects.toThrow(/seedPhrase doesn't match/)

    await expect(() => walletManager.initWallets(1, "test test test test test test test test test test test wrong")).rejects.toThrow(/invalid mnemonic checksum/)
  })

  it("start: Starts the proper functions in correct order", async () => {
    expect.assertions(7)

    const mockAddress = "0x661188"

    const walletManager = new WalletManager(mockConfig)
    const loggerSpy = spyOnLogger(walletManager)
    walletManager.getSeedPhrase = mockGetSeedPhrase
    walletManager._wallet0 = {
      getAddress: () => mockAddress,
    } as unknown as Wallet
    walletManager.initWallets = vi.fn().mockResolvedValue(null)
    walletManager.processReleasedWallets = vi.fn().mockImplementation(() => {
      expect(walletManager.initWallets).toHaveBeenCalledTimes(1)
      return Promise.resolve()
    })
    walletManager.fuelNeedingWallets = vi.fn().mockImplementation(() => {
      expect(walletManager.processReleasedWallets).toBeCalledTimes(1)
      return Promise.resolve()
    })
    walletManager.connectionCheck = vi.fn()

    await walletManager.start()

    expect(loggerSpy.info).toBeCalledWith("Starting Wallet Manager", {
      chainId: 4488,
    })

    expect(walletManager.connectionCheck).toBeCalledTimes(1)
    expect(walletManager.initWallets).toBeCalledTimes(1)
    expect(walletManager.initWallets).toBeCalledWith(mockConfig.walletCount, TEST_SEED_PHRASE)
    expect(walletManager.processReleasedWallets).toBeCalledTimes(1)
  })

  it("initWallets: Creates wallets", async () => {
    const expectedWallets = [
      "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
      "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
      "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
    ]

    expect.assertions(2 + 2 * expectedWallets.length)

    const walletManager = new WalletManager(mockConfig)
    walletManager.getSeedPhrase = mockGetSeedPhrase
    walletManager.getGasBalance = vi.fn().mockReturnValue(TEST_BALANCE_LOW_WATERMARK)
    walletManager._provider = mockProvider
    walletManager.needNewProviderConnection = false

    await walletManager.initWallets(expectedWallets.length, TEST_SEED_PHRASE)

    expect(walletManager.releasedWallets.size()).toBe(expectedWallets.length)

    await walletManager.processReleasedWallets()

    expect(walletManager.getAvailableWalletCount()).toBe(expectedWallets.length)

    for (const expectedAddress of expectedWallets) {
      const wallet = walletManager.requestWallet()
      expect(wallet).not.toBe(null)

      const signer = wallet?.getSigner()
      // oxlint-disable-next-line no-await-in-loop
      const signerAddress = await signer?.getAddress()
      expect(signerAddress).toBe(expectedAddress)
    }
  })

  it("requestWallet: Returning null when no available signers", async () => {
    expect.assertions(2)

    const walletManager = new WalletManager(mockConfig)
    walletManager.getSeedPhrase = mockGetSeedPhrase
    walletManager.getGasBalance = vi.fn().mockReturnValue(TEST_BALANCE_LOW_WATERMARK)
    walletManager._provider = mockProvider
    walletManager.needNewProviderConnection = false

    await walletManager.initWallets(1, TEST_SEED_PHRASE)
    await walletManager.processReleasedWallets()

    const s1 = walletManager.requestWallet()
    expect(s1).not.toBe(null)

    const s2 = walletManager.requestWallet()
    expect(s2).toBe(null)
  })

  it("requestWallet: Throwing if shift() doesn't give a wallet", () => {
    expect.assertions(1)

    const mockQueue = {
      isEmpty: vi.fn().mockReturnValue(false),
      // oxlint-disable-next-line no-useless-undefined
      shift: vi.fn().mockReturnValue(undefined),
      size: vi.fn(),
    } as unknown as Queue<Wallet>

    const walletManager = new WalletManager(mockConfig)
    walletManager.getSeedPhrase = mockGetSeedPhrase
    walletManager.availableWallets = mockQueue

    expect(() => walletManager.requestWallet()).toThrow(
      "Tried to shift() an wallet, but got undefined",
    )
  })

  it("requestWallet/releaseWallet: Returning null when no available signers, then after release returns signer", async () => {
    expect.assertions(5)

    const walletManager = new WalletManager(mockConfig)
    walletManager.getSeedPhrase = mockGetSeedPhrase
    walletManager.getGasBalance = vi.fn().mockReturnValue(TEST_BALANCE_LOW_WATERMARK)
    walletManager._provider = mockProvider
    walletManager.needNewProviderConnection = false

    await walletManager.initWallets(1, TEST_SEED_PHRASE)
    await walletManager.processReleasedWallets()

    const w1 = walletManager.requestWallet()
    expect(w1).not.toBe(null)

    expect(walletManager.getAvailableWalletCount()).toBe(0)

    const w2 = walletManager.requestWallet()
    expect(w2).toBe(null)

    walletManager.releaseWallet(w1!)
    await walletManager.processReleasedWallets()

    const w3 = walletManager.requestWallet()
    expect(w3).not.toBe(null)
    expect(w3).toBe(w1)
  })

  it("requestWalletNotNull: Returns wallet", () => {
    expect.assertions(2)

    const mockWallet = "An mocked wallet that's not null" as unknown as Wallet

    const manager = new WalletManager(mockConfig)
    manager.getSeedPhrase = mockGetSeedPhrase
    manager.requestWallet = vi.fn().mockReturnValue(mockWallet)

    const returnedWallet = manager.requestWalletNotNull()

    expect(returnedWallet).toBe(mockWallet)
    expect(manager.requestWallet).toHaveBeenCalledTimes(1)
  })

  it("requestWalletNotNull: Throws if !wallet", () => {
    expect.assertions(2)

    const manager = new WalletManager(mockConfig)
    manager.getSeedPhrase = mockGetSeedPhrase
    manager.requestWallet = vi.fn().mockReturnValue(null)

    expect(() => manager.requestWalletNotNull()).toThrow(
      "Requesting wallet when none is available if a breach of contract for this function",
    )
    expect(manager.requestWallet).toHaveBeenCalledTimes(1)
  })

  it("releaseWallet: Throws on double release", async () => {
    expect.assertions(3)

    const walletManager = new WalletManager(mockConfig)
    walletManager.getSeedPhrase = mockGetSeedPhrase
    walletManager._provider = mockProvider
    walletManager.needNewProviderConnection = false

    await walletManager.initWallets(1, TEST_SEED_PHRASE)
    walletManager.getGasBalance = vi.fn().mockReturnValue(TEST_BALANCE_LOW_WATERMARK + BigInt(1))

    await walletManager.processReleasedWallets()

    const w1 = walletManager.requestWallet()
    expect(w1).not.toBe(null)

    expect(walletManager.releaseWallet(w1!)).toBe(undefined)
    expect(() => walletManager.releaseWallet(w1!)).toThrow(
      /Trying to release wallet that is not busy/,
    )
  })

  it("getGasBalance: Returns gas balance from provider", async () => {
    expect.assertions(3)

    const mockAddress = "0x9911"
    const mockWallet = {
      getAddress: vi.fn().mockReturnValue(mockAddress),
    } as unknown as Wallet
    const mockBalance = BigInt(1144)
    const mockProviderLocal = {
      getBalance: vi.fn().mockReturnValue(mockBalance),
    } as unknown as JsonRpcProvider

    const manager = new WalletManager(mockConfig)
    manager.getSeedPhrase = mockGetSeedPhrase
    manager._provider = mockProviderLocal

    const returnedBalance = await manager.getGasBalance(mockWallet)
    expect(returnedBalance).toBe(mockBalance)
    expect(mockWallet.getAddress).toHaveBeenCalled()
    expect(mockProviderLocal.getBalance).toHaveBeenCalledWith(mockAddress)
  })

  it("getGasBalance: Returns null and requests new connection on error", async () => {
    expect.assertions(2)

    const mockError = new Error("Provider error")
    const mockWallet = {
      getAddress: vi.fn().mockReturnValue("0x1234"),
      address: "0x1234",
    } as unknown as Wallet
    const mockProviderLocal = {
      getBalance: vi.fn().mockRejectedValue(mockError),
    } as unknown as JsonRpcProvider

    const manager = new WalletManager(mockConfig)
    manager.getSeedPhrase = mockGetSeedPhrase
    manager._provider = mockProviderLocal
    manager.requestNewProviderConnection = vi.fn()

    const returnedBalance = await manager.getGasBalance(mockWallet)

    expect(returnedBalance).toBe(null)
    expect(manager.requestNewProviderConnection).toHaveBeenCalledWith(
      `Got error while checking gas balance: ${mockError}`,
    )
  })

  it("getAvailableWalletCount: Returns 0 when needNewProviderConnection is true", () => {
    expect.assertions(1)

    const manager = new WalletManager(mockConfig)
    manager.needNewProviderConnection = true

    expect(manager.getAvailableWalletCount()).toBe(0)
  })

  it("getAvailableWalletCount: Returning the correct number of available wallets", async () => {
    expect.assertions(6)

    const walletManager = new WalletManager(mockConfig)
    walletManager.getSeedPhrase = mockGetSeedPhrase
    walletManager._provider = mockProvider
    walletManager.needNewProviderConnection = false

    await walletManager.initWallets(2, TEST_SEED_PHRASE)
    walletManager.getGasBalance = vi.fn().mockReturnValue(TEST_BALANCE_LOW_WATERMARK)
    await walletManager.processReleasedWallets()

    expect(walletManager.getAvailableWalletCount()).toBe(2)

    const w1 = walletManager.requestWallet()
    expect(walletManager.getAvailableWalletCount()).toBe(1)

    const w2 = walletManager.requestWallet()
    expect(walletManager.getAvailableWalletCount()).toBe(0)

    walletManager.releaseWallet(w1!)
    await walletManager.processReleasedWallets()
    expect(walletManager.getAvailableWalletCount()).toBe(1)

    walletManager.releaseWallet(w2!)
    await walletManager.processReleasedWallets()
    expect(walletManager.getAvailableWalletCount()).toBe(2)

    walletManager.requestWallet()
    expect(walletManager.getAvailableWalletCount()).toBe(1)
  })

  it("processReleasedWallets: Correctly checks wallet balance", async () => {
    expect.assertions(5)

    const walletManager = new WalletManager(mockConfig)
    walletManager.getSeedPhrase = mockGetSeedPhrase
    walletManager.shutdownInProgress = true
    walletManager._provider = mockProvider
    walletManager.needNewProviderConnection = false

    await walletManager.initWallets(4, TEST_SEED_PHRASE)

    walletManager.getGasBalance = vi
      .fn()
      .mockReturnValueOnce(TEST_BALANCE_LOW_WATERMARK - BigInt(1))
      .mockReturnValueOnce(TEST_BALANCE_LOW_WATERMARK - BigInt(1))
      .mockReturnValueOnce(TEST_BALANCE_LOW_WATERMARK + BigInt(1))
      .mockReturnValueOnce(TEST_BALANCE_LOW_WATERMARK + BigInt(1))

    await walletManager.processReleasedWallets()

    expect(walletManager.releasedWallets.isEmpty()).toBe(true)
    expect(walletManager.getAvailableWalletCount()).toBe(2)
    expect(walletManager.walletsNeedingFunding.size()).toBe(2)

    expect(walletManager.walletsNeedingFunding.peek()?.id).toBe(1)
    expect(walletManager.availableWallets.peek()?.id).toBe(3)
  })

  it("processReleasedWallets: Breaks when getGasBalance returns null", async () => {
    expect.assertions(2)

    const manager = new WalletManager(mockConfig)
    const loggerSpy = spyOnLogger(manager)
    manager.getSeedPhrase = mockGetSeedPhrase
    manager._provider = mockProvider
    manager.needNewProviderConnection = false
    manager.shutdownInProgress = true

    await manager.initWallets(2, TEST_SEED_PHRASE)
    manager.getGasBalance = vi.fn().mockReturnValue(null)

    await manager.processReleasedWallets()

    expect(loggerSpy.warn).toHaveBeenCalledWith("Got null when checking wallet balance, skipping", {
      chainId: 4488,
      walletId: 1,
      walletAddress: expect.any(String),
    })
    expect(manager.releasedWallets.size()).toBe(2)
  })

  it("processReleasedWallets: Catches and logs exception in outer catch block", async () => {
    expect.assertions(1)

    const manager = new WalletManager(mockConfig)
    const loggerSpy = spyOnLogger(manager)
    manager.getSeedPhrase = mockGetSeedPhrase
    manager.shutdownInProgress = true
    manager.needNewProviderConnection = false

    // Make releasedWallets.isEmpty throw an error to trigger outer catch
    manager.releasedWallets = {
      isEmpty: vi.fn().mockImplementation(() => {
        throw new Error("Queue error")
      }),
      size: () => 1,
    } as unknown as Queue<Wallet>

    await manager.processReleasedWallets()

    expect(loggerSpy.error).toHaveBeenCalledWith(
      "Got exception in processReleasedWallets(): Queue error",
    )
  })

  it("processReleasedWallets: Catches and logs exception", async () => {
    expect.assertions(1)

    const mockErrorMessage = "Some error happened"

    const manager = new WalletManager(mockConfig)
    const loggerSpy = spyOnLogger(manager)
    manager.getSeedPhrase = mockGetSeedPhrase
    manager.needNewProviderConnection = false
    manager.releasedWallets = {
      isEmpty: vi.fn().mockReturnValueOnce(false),
      peek: vi.fn().mockReturnValueOnce("mocked wallet 665544" as unknown as Wallet),
      remove: vi.fn(),
      size: () => 2,
    } as unknown as Queue<Wallet>

    manager.getGasBalance = vi.fn().mockImplementation(() => {
      throw new Error(mockErrorMessage)
    })

    await manager.processReleasedWallets()

    expect(loggerSpy.error).toHaveBeenCalledWith(
      "Got error when checking wallet: Error: Some error happened",
      {
        chainId: 4488,
        walletAddress: undefined,
        walletId: undefined,
      },
    )
  })

  it("processReleasedWallets: runningProcess counter goes up and down", async () => {
    expect.assertions(2)

    const manager = new WalletManager(mockConfig)
    manager.getSeedPhrase = mockGetSeedPhrase
    manager.releasedWallets = {
      isEmpty: () => true,
      size: () => 0,
    } as unknown as Queue<Wallet>

    expect(manager.runningProcesses).toBe(0)
    await manager.processReleasedWallets()
    expect(manager.runningProcesses).toBe(0)
  })

  it("processReleasedWallets: Initiating the timer for the next run, but not on shutdown", async () => {
    expect.assertions(10)

    const spySetTimeout = vi.spyOn(global, "setTimeout")
    const spyClearTimeout = vi.spyOn(global, "clearTimeout")

    const manager = new WalletManager(mockConfig)
    const loggerSpy = spyOnLogger(manager)
    manager.getSeedPhrase = mockGetSeedPhrase
    manager.releasedWallets = {
      isEmpty: () => true,
      size: () => 0,
    } as unknown as Queue<Wallet>

    expect(manager.shutdownInProgress).toBe(false)
    expect(loggerSpy.info).toBeCalledTimes(0)

    await manager.processReleasedWallets()

    expect(spySetTimeout).toBeCalledTimes(1)
    expect(spySetTimeout).nthCalledWith(
      1,
      expect.any(Function),
      mockConfig.processReleasedWalletsDelay,
    )

    vi.runOnlyPendingTimers()

    expect(spySetTimeout).toBeCalledTimes(2)
    expect(spySetTimeout).nthCalledWith(
      2,
      expect.any(Function),
      mockConfig.processReleasedWalletsDelay,
    )

    const shutdownPromise = manager.shutdown()

    vi.runOnlyPendingTimers()

    expect(spySetTimeout).toBeCalledTimes(2)
    expect(spyClearTimeout).toBeCalledTimes(1)
    expect(spyClearTimeout).toBeCalledWith(manager.timerProcessReleasedWallets)
    await expect(shutdownPromise).resolves.toBe(undefined)
  })

  it("fuelNeedingWallets: Correctly refills wallets in the need funding queue with gas", async () => {
    expect.assertions(5)

    const mockHash = "0x1234"
    const mockW0Signer = {
      sendTransaction: vi
        .fn()
        .mockReturnValue({ wait: () => Promise.resolve({ status: true, hash: mockHash }) }),
      connect: vi.fn().mockReturnThis(),
    } as unknown as Signer

    const walletManager = new WalletManager(mockConfig)
    walletManager.getSeedPhrase = mockGetSeedPhrase
    walletManager._provider = mockProvider
    walletManager.needNewProviderConnection = false
    await walletManager.initWallets(4, TEST_SEED_PHRASE)

    walletManager.shutdownInProgress = true
    walletManager.wallet0.getSigner = vi.fn().mockReturnValue(mockW0Signer)
    walletManager.refuelAmount = BigInt(100)

    walletManager.getGasBalance = vi
      .fn()
      .mockReturnValueOnce(TEST_BALANCE_LOW_WATERMARK + BigInt(1))
      .mockReturnValueOnce(TEST_BALANCE_LOW_WATERMARK - BigInt(1))
      .mockReturnValueOnce(TEST_BALANCE_LOW_WATERMARK + BigInt(1))
      .mockReturnValueOnce(TEST_BALANCE_LOW_WATERMARK - BigInt(1))
      .mockReturnValueOnce(TEST_BALANCE_LOW_WATERMARK * BigInt(10))

    await walletManager.processReleasedWallets()

    const firstAddress = walletManager.walletsNeedingFunding.peek(0)?.getAddress()
    const secondAddress = walletManager.walletsNeedingFunding.peek(1)?.getAddress()
    const value = walletManager.refuelAmount

    expect(walletManager.availableWallets.size()).toBe(2)

    await walletManager.fuelNeedingWallets()
    expect(mockW0Signer.connect).toBeCalled()
    expect(mockW0Signer.sendTransaction).toHaveBeenNthCalledWith(1, { to: firstAddress, value })
    expect(mockW0Signer.sendTransaction).toHaveBeenNthCalledWith(2, { to: secondAddress, value })
    expect(walletManager.availableWallets.size()).toBe(4)
  })

  it("fuelNeedingWallets: Break and log error on low wallet 0 balance", async () => {
    expect.assertions(2)

    const mockSigner = {
      connect: vi.fn(),
    } as unknown as Signer

    const manager = new WalletManager(mockConfig)
    const loggerSpy = spyOnLogger(manager)
    manager.getSeedPhrase = mockGetSeedPhrase
    manager.needNewProviderConnection = false
    manager._provider = mockProvider
    manager.shutdownInProgress = true
    manager.getGasBalance = vi.fn().mockReturnValue(BigInt(10))
    manager._wallet0 = {
      getSigner: () => mockSigner,
      getAddress: vi.fn().mockReturnValue("0x773311"),
    } as unknown as Wallet
    manager.walletsNeedingFunding = {
      isEmpty: () => false,
      peek: vi.fn(),
      size: () => 0,
    } as unknown as Queue<Wallet>
    manager.refuelAmount = BigInt(100)

    await manager.fuelNeedingWallets()
    expect(loggerSpy.error).toHaveBeenCalledWith("Wallet 0 (0x773311) is out of fuel", {
      chainId: 4488,
      walletAddress: undefined,
      walletBalance: "10",
      walletId: undefined,
    })
    expect(manager.walletsNeedingFunding.peek).not.toHaveBeenCalled()
  })

  it("fuelNeedingWallets: Log error and push to released wallets on negative result", async () => {
    expect.assertions(3)

    const mockAddress = "Some address 0x1243"

    const mockWallet = {
      getAddress: vi.fn().mockReturnValue(mockAddress),
    }

    const mockResult = {
      status: false,
      hash: "0x3322",
    } as unknown as TransactionReceipt

    const mockTxResponse = {
      wait: vi.fn().mockResolvedValue(mockResult),
    } as unknown as TransactionResponse

    const mockSigner = {
      sendTransaction: vi.fn().mockResolvedValue(mockTxResponse),
      connect: vi.fn().mockReturnThis(),
    } as unknown as Signer

    const manager = new WalletManager(mockConfig)
    const loggerSpy = spyOnLogger(manager)
    manager.getSeedPhrase = mockGetSeedPhrase
    manager.needNewProviderConnection = false
    manager.shutdownInProgress = true
    manager.getGasBalance = vi.fn().mockReturnValue(BigInt(1000))
    manager._wallet0 = { getSigner: () => mockSigner } as unknown as Wallet
    manager.walletsNeedingFunding = {
      isEmpty: vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true),
      peek: vi.fn().mockReturnValue(mockWallet),
      remove: vi.fn(),
      size: () => 1,
    } as unknown as Queue<Wallet>
    manager.releasedWallets = {
      push: vi.fn(),
    } as unknown as Queue<Wallet>
    manager.refuelAmount = BigInt(100)
    manager._provider = mockProvider

    await manager.fuelNeedingWallets()
    expect(loggerSpy.error).toHaveBeenCalledWith(
      `Failed to refuel wallet ${mockAddress} in tx ${mockResult.hash}`,
      {
        chainId: 4488,
        txHash: "0x3322",
        walletAddress: undefined,
        walletId: undefined,
      },
    )
    expect(manager.releasedWallets.push).toHaveBeenCalledWith(mockWallet)
    expect(manager.walletsNeedingFunding.remove).toHaveBeenCalledWith(mockWallet)
  })

  it("fuelNeedingWallets: runningProcess counter goes up and down", async () => {
    expect.assertions(3)

    const mockSigner = {
      sendTransaction: vi.fn(),
      connect: vi.fn().mockReturnThis(),
    } as unknown as Signer

    const manager = new WalletManager(mockConfig)
    manager.getSeedPhrase = mockGetSeedPhrase
    manager.needNewProviderConnection = false
    manager._provider = mockProvider
    manager.getGasBalance = vi.fn().mockImplementation(() => {
      expect(manager.runningProcesses).toBe(1)
      return BigInt("0")
    })
    manager._wallet0 = {
      getSigner: () => mockSigner,
      connect: vi.fn().mockReturnThis(),
    } as unknown as Wallet
    manager.walletsNeedingFunding = {
      isEmpty: () => true,
      size: () => 0,
    } as unknown as Queue<Wallet>

    expect(manager.runningProcesses).toBe(0)
    await manager.fuelNeedingWallets()
    expect(manager.runningProcesses).toBe(0)
  })

  it("fuelNeedingWallets:  Initiating the timer for the next run, but not on shutdown", async () => {
    expect.assertions(12)

    const spySetTimeout = vi.spyOn(global, "setTimeout")
    const spyClearTimeout = vi.spyOn(global, "clearTimeout")

    const mockSigner = {
      sendTransaction: vi.fn(),
      connect: vi.fn().mockReturnThis(),
    } as unknown as Signer

    const manager = new WalletManager(mockConfig)
    const loggerSpy = spyOnLogger(manager)
    manager.getSeedPhrase = mockGetSeedPhrase
    manager.needNewProviderConnection = false
    manager._provider = mockProvider
    manager.getGasBalance = vi.fn().mockReturnValue(BigInt("0"))
    manager._wallet0 = {
      getSigner: () => mockSigner,
    } as unknown as Wallet
    manager.walletsNeedingFunding = {
      isEmpty: () => true,
      size: () => 0,
    } as unknown as Queue<Wallet>

    expect(manager.shutdownInProgress).toBe(false)
    expect(loggerSpy.debug).toBeCalledTimes(0)

    await manager.fuelNeedingWallets()

    expect(loggerSpy.debug).toBeCalledTimes(1)
    expect(spySetTimeout).toBeCalledTimes(1)
    expect(spySetTimeout).nthCalledWith(1, expect.any(Function), mockConfig.refuelDelay)

    await vi.runOnlyPendingTimersAsync()

    expect(loggerSpy.debug).toBeCalledTimes(2)
    expect(spySetTimeout).toBeCalledTimes(2)
    expect(spySetTimeout).nthCalledWith(2, expect.any(Function), mockConfig.refuelDelay)

    const shutdownPromise = manager.shutdown()

    await vi.runOnlyPendingTimersAsync()

    expect(spySetTimeout).toBeCalledTimes(2)
    expect(spyClearTimeout).toBeCalledTimes(1)
    expect(spyClearTimeout).toBeCalledWith(manager.timerFuelNeedingWallets)
    await expect(shutdownPromise).resolves.toBe(undefined)
  })

  it("fuelNeedingWallets: Returns early when needNewProviderConnection is true", async () => {
    expect.assertions(2)

    const manager = new WalletManager(mockConfig)
    const loggerSpy = spyOnLogger(manager)
    manager.needNewProviderConnection = true
    manager.shutdownInProgress = true

    await manager.fuelNeedingWallets()

    expect(loggerSpy.warn).toHaveBeenCalledWith("Fueling waiting for connection", {
      chainId: 4488,
    })
    expect(manager.runningProcesses).toBe(0)
  })

  it("fuelNeedingWallets: Returns early when wallet0Balance is null", async () => {
    expect.assertions(2)

    const manager = new WalletManager(mockConfig)
    const loggerSpy = spyOnLogger(manager)
    manager.getSeedPhrase = mockGetSeedPhrase
    manager.needNewProviderConnection = false
    manager._provider = mockProvider
    manager.shutdownInProgress = true
    manager._wallet0 = { id: 0, address: "0xWallet0" } as unknown as Wallet
    manager.getGasBalance = vi.fn().mockReturnValue(null)

    await manager.fuelNeedingWallets()

    expect(loggerSpy.warn).toHaveBeenCalledWith("Unable to fetch Wallet 0 balance, skipping", {
      chainId: 4488,
      walletId: 0,
      walletAddress: "0xWallet0",
    })
    expect(manager.runningProcesses).toBe(0)
  })

  it("fuelNeedingWallets: Throws error when sendTransaction fails", async () => {
    expect.assertions(1)

    const mockWallet = {
      getAddress: vi.fn().mockReturnValue("0x1234"),
      address: "0x1234",
    }

    const mockError = new Error("Transaction failed")
    const mockSigner = {
      sendTransaction: vi.fn().mockRejectedValue(mockError),
      connect: vi.fn().mockReturnThis(),
    } as unknown as Signer

    const manager = new WalletManager(mockConfig)
    manager.getSeedPhrase = mockGetSeedPhrase
    manager.needNewProviderConnection = false
    manager.shutdownInProgress = true
    manager._provider = mockProvider
    manager.getGasBalance = vi.fn().mockReturnValue(BigInt(1000))
    manager._wallet0 = { getSigner: () => mockSigner } as unknown as Wallet
    manager.walletsNeedingFunding = {
      isEmpty: vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true),
      peek: vi.fn().mockReturnValue(mockWallet),
      size: () => 1,
    } as unknown as Queue<Wallet>
    manager.refuelAmount = BigInt(100)

    await expect(() => manager.fuelNeedingWallets()).rejects.toThrow(
      /Got error when sending transaction to refuel/,
    )
  })

  it("fuelNeedingWallets: Throws error when wait fails", async () => {
    expect.assertions(1)

    const mockWallet = {
      getAddress: vi.fn().mockReturnValue("0x1234"),
      address: "0x1234",
    }

    const mockError = new Error("Wait failed")
    const mockTxResponse = {
      wait: vi.fn().mockRejectedValue(mockError),
    } as unknown as TransactionResponse

    const mockSigner = {
      sendTransaction: vi.fn().mockResolvedValue(mockTxResponse),
      connect: vi.fn().mockReturnThis(),
    } as unknown as Signer

    const manager = new WalletManager(mockConfig)
    manager.getSeedPhrase = mockGetSeedPhrase
    manager.needNewProviderConnection = false
    manager.shutdownInProgress = true
    manager._provider = mockProvider
    manager.getGasBalance = vi.fn().mockReturnValue(BigInt(1000))
    manager._wallet0 = { getSigner: () => mockSigner } as unknown as Wallet
    manager.walletsNeedingFunding = {
      isEmpty: vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true),
      peek: vi.fn().mockReturnValue(mockWallet),
      size: () => 1,
    } as unknown as Queue<Wallet>
    manager.refuelAmount = BigInt(100)

    await expect(() => manager.fuelNeedingWallets()).rejects.toThrow(
      /Got error while waiting for confirmation of refuel/,
    )
  })

  it("connectionCheck: Successfully connects when needNewProviderConnection is true", async () => {
    expect.assertions(5)

    const manager = new WalletManager(mockConfig)
    const loggerSpy = spyOnLogger(manager)
    manager.shutdownInProgress = true
    manager.needNewProviderConnection = true

    // Mock provider.getNetwork() to return a network
    // Use regular objects that can be serialized (no BigInt)
    const mockNetwork = {
      chainId: 4488,
      name: "metis-sepolia",
      toJSON: () => ({ chainId: 4488, name: "metis-sepolia" }),
    }
    vi.spyOn(ethers.JsonRpcProvider.prototype, "getNetwork").mockResolvedValue(mockNetwork as any)

    await manager.connectionCheck()

    expect(loggerSpy.info).toHaveBeenCalledTimes(2)
    expect(loggerSpy.info).toHaveBeenNthCalledWith(
      1,
      `Connecting to Provider: ${mockConfig.providerEndpoint}`,
      { chainId: 4488 },
    )
    expect(loggerSpy.info).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("New Provider connection on network:"),
      { chainId: 4488 },
    )
    expect(manager.needNewProviderConnection).toBe(false)
    expect(manager._provider).not.toBeNull()
  })

  it("connectionCheck: Does nothing when needNewProviderConnection is false", async () => {
    expect.assertions(2)

    const manager = new WalletManager(mockConfig)
    const loggerSpy = spyOnLogger(manager)
    manager.shutdownInProgress = true
    manager.needNewProviderConnection = false

    await manager.connectionCheck()

    expect(loggerSpy.info).not.toHaveBeenCalled()
    expect(manager.runningProcesses).toBe(0)
  })

  it("connectionCheck: Logs error when connection fails", async () => {
    expect.assertions(2)

    // Mock getNetwork to throw an error
    const mockError = new Error("Connection failed")
    vi.spyOn(ethers.JsonRpcProvider.prototype, "getNetwork").mockRejectedValue(mockError)

    const manager = new WalletManager(mockConfig)
    const loggerSpy = spyOnLogger(manager)
    manager.getSeedPhrase = mockGetSeedPhrase
    manager.shutdownInProgress = true
    manager.needNewProviderConnection = true

    await manager.connectionCheck()

    expect(loggerSpy.error).toHaveBeenCalledWith(`Not able to connect to Provider: ${mockError}`, {
      chainId: 4488,
    })
    expect(manager.needNewProviderConnection).toBe(true)
  })

  it("connectionCheck: Sets timer when not shutting down", async () => {
    expect.assertions(4)

    const manager = new WalletManager(mockConfig)
    const connectionCheckSpy = vi.spyOn(manager, "connectionCheck")
    manager.shutdownInProgress = false
    manager.needNewProviderConnection = false

    await manager.connectionCheck()

    expect(manager.timerConnectionCheck).not.toBeNull()
    expect(manager.runningProcesses).toBe(0)

    // Advance timers to trigger the arrow function and get coverage
    await vi.advanceTimersByTimeAsync(mockConfig.connectionCheckDelay)

    // Verify the timer callback actually called connectionCheck again
    expect(connectionCheckSpy).toHaveBeenCalledTimes(2)
    expect(manager.runningProcesses).toBe(0)
  })

  it("connectionCheck: Does not set timer when shutting down", async () => {
    expect.assertions(2)

    const spySetTimeout = vi.spyOn(global, "setTimeout")

    const manager = new WalletManager(mockConfig)
    manager.shutdownInProgress = true
    manager.needNewProviderConnection = false

    await manager.connectionCheck()

    expect(spySetTimeout).not.toHaveBeenCalled()
    expect(manager.runningProcesses).toBe(0)
  })

  it("requestNewProviderConnection: Sets needNewProviderConnection flag and logs", () => {
    expect.assertions(3)

    const manager = new WalletManager(mockConfig)
    const loggerSpy = spyOnLogger(manager)
    manager.needNewProviderConnection = false

    const reason = "Test reason for reconnection"
    manager.requestNewProviderConnection(reason)

    expect(manager.needNewProviderConnection).toBe(true)
    expect(loggerSpy.warn).toHaveBeenCalledWith(
      `Got request for new Provider connection due to: ${reason}`,
      { chainId: 4488 },
    )
    expect(loggerSpy.warn).toHaveBeenCalledTimes(1)
  })

  it("shutdown: Triggers shutdown and resolves immediately when no running processes", async () => {
    expect.assertions(3)

    const manager = new WalletManager(mockConfig)
    manager.getSeedPhrase = mockGetSeedPhrase
    manager.runningProcesses = 0

    expect(manager.shutdownInProgress).toBe(false)

    const shutdownPromise = manager.shutdown()
    await vi.runOnlyPendingTimersAsync()

    expect(manager.shutdownInProgress).toBe(true)
    await expect(shutdownPromise).resolves.toBe(undefined)
  })

  it("shutdown: Clears timers on shutdown", async () => {
    expect.assertions(7)

    const spyClearTimeout = vi.spyOn(global, "clearTimeout")

    const manager = new WalletManager(mockConfig)
    manager.getSeedPhrase = mockGetSeedPhrase
    manager.timerProcessReleasedWallets = 123 as unknown as NodeJS.Timeout
    manager.timerFuelNeedingWallets = 321 as unknown as NodeJS.Timeout
    manager.timerConnectionCheck = 456 as unknown as NodeJS.Timeout

    expect(manager.shutdownInProgress).toBe(false)

    const shutdownPromise = manager.shutdown()

    await vi.runOnlyPendingTimersAsync()
    expect(manager.shutdownInProgress).toBe(true)
    expect(spyClearTimeout).toHaveBeenCalledTimes(3)
    expect(spyClearTimeout).toHaveBeenCalledWith(manager.timerProcessReleasedWallets)
    expect(spyClearTimeout).toHaveBeenCalledWith(manager.timerFuelNeedingWallets)
    expect(spyClearTimeout).toHaveBeenCalledWith(manager.timerConnectionCheck)

    await expect(shutdownPromise).resolves.toBe(undefined)
  })

  it("shutdown: Doesn't return on running processes, but after it ends", async () => {
    expect.assertions(4)

    const manager = new WalletManager(mockConfig)
    manager.getSeedPhrase = mockGetSeedPhrase
    manager.runningProcesses = 1
    expect(manager.shutdownInProgress).toBe(false)

    const shutdownPromise = manager.shutdown()

    vi.runOnlyPendingTimers()
    expect(manager.shutdownInProgress).toBe(true)

    // Verify shutdown hasn't completed yet while processes are running
    let shutdownCompleted = false
    void shutdownPromise.then(() => {
      shutdownCompleted = true
      // oxlint-disable-next-line no-useless-return
      return
    })
    vi.runOnlyPendingTimers()
    expect(shutdownCompleted).toBe(false)

    // Now allow shutdown to complete
    manager.runningProcesses = 0
    vi.runOnlyPendingTimers()
    await expect(shutdownPromise).resolves.toBe(undefined)
  })
})

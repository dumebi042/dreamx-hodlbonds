import { SecretManagerServiceClient } from "@google-cloud/secret-manager"
import {
  ethers,
  getIndexedAccountPath,
  HDNodeWallet,
  Mnemonic,
  type Provider,
  type Signer,
} from "ethers"
import log4js, { type Logger } from "log4js"

import { baseConfig } from "./config"
import { MerkleTreeManager } from "./MerkleTreeManager"
import { WalletManagerConfigSchema, type WalletManagerConfig } from "./schemas"
import { Queue } from "./utils/Queue"
import { regexSeedPhrase12, regexSeedPhrase24 } from "./utils/Regex"
import { Wallet } from "./Wallet"

/**
 * Class for managing and refilling wallets
 */
export class WalletManager {
  logger: Logger = log4js.getLogger("WalletManager")

  _wallet0: Wallet | null = null
  _merkleTreeManager: MerkleTreeManager | null = null
  availableWallets = new Queue<Wallet>()
  busyWallets = new Queue<Wallet>()
  releasedWallets = new Queue<Wallet>()
  walletsNeedingFunding = new Queue<Wallet>()

  balanceLowWatermark: bigint
  refuelAmount: bigint
  wallet0BalanceLowWatermark: bigint

  config: WalletManagerConfig
  _provider: Provider | null = null
  needNewProviderConnection = true

  shutdownInProgress = false
  timerProcessReleasedWallets: NodeJS.Timeout | null = null
  timerFuelNeedingWallets: NodeJS.Timeout | null = null
  timerConnectionCheck: NodeJS.Timeout | null = null
  runningProcesses = 0

  /**
   *
   * @param {WalletManagerConfig} config
   */
  constructor(config: WalletManagerConfig) {
    this.config = WalletManagerConfigSchema.parse(config)

    this.balanceLowWatermark = ethers.parseEther(config.gasBalanceLowWaterMarkEther)
    this.wallet0BalanceLowWatermark = ethers.parseEther(config.wallet0GasBalanceLowWaterMarkEther)
    this.refuelAmount = ethers.parseEther(config.refuelAmount)
  }

  /**
   * @return {Promise<string>}
   */
  async getSeedPhrase(): Promise<string> {
    const client = new SecretManagerServiceClient()
    const secretName = `projects/${baseConfig.GCP_PROJECT_ID}/secrets/${baseConfig.SEED_PHRASE_SECRET}/versions/latest`
    const [version] = await client.accessSecretVersion({ name: secretName })
    const payload = version.payload?.data

    if (!payload) {
      throw new Error(`Secret ${baseConfig.SEED_PHRASE_SECRET} has no payload`)
    }

    return typeof payload === "string" ? payload.trim() : Buffer.from(payload).toString("utf8").trim()
  }

  /**
   * @return {Provider}
   */
  get provider(): Provider {
    if (!this._provider) {
      throw new Error("Provider not connected")
    }

    return this._provider
  }

  /**
   * @return {Wallet}
   */
  get wallet0(): Wallet {
    if (!this._wallet0) {
      throw new Error("Wallet0 not initialized")
    }

    return this._wallet0
  }

  /**
   * Get the MerkleTreeManager instance
   * @return {MerkleTreeManager}
   */
  getMerkleTreeManager(): MerkleTreeManager {
    if (!this._merkleTreeManager) {
      throw new Error("MerkleTreeManager not initialized")
    }

    return this._merkleTreeManager
  }

  /**
   * @return {Promise<void>}
   */
  async start(): Promise<void> {
    this.logger.info("Starting Wallet Manager", { chainId: this.config.chainId })
    await this.connectionCheck()
    let seedPhrase: string | null = await this.getSeedPhrase()
    await this.initWallets(this.config.walletCount, seedPhrase)
    await this.buildMerkleTreeManager(seedPhrase)
    seedPhrase = null
    await this.processReleasedWallets()
    await this.fuelNeedingWallets()
  }

  /**
   *
   * @param {number} count
   */
  async initWallets(count: number, seedPhrase: string) {

    if (!regexSeedPhrase12.test(seedPhrase) && !regexSeedPhrase24.test(seedPhrase)) {
      throw new Error(`seedPhrase doesn't match ${regexSeedPhrase12} or ${regexSeedPhrase24}`)
    }

    const mnemonic = Mnemonic.fromPhrase(seedPhrase)
    const hdNode = HDNodeWallet.fromMnemonic(mnemonic)

    this._wallet0 = new Wallet(hdNode, 0, await hdNode.getAddress())
    this.logger.info(`Wallet 0: ${this.wallet0.getAddress()}`, {
      chainId: this.config.chainId,
      walletId: this.wallet0.id,
      walletAddress: this.wallet0.address,
    })

    const startAt = this.config.walletOffset

    this.logger.info(
      `Initializing ${count} wallets (${startAt}-${startAt + count - 1}) from: ${this.wallet0.getAddress()}`,
      { chainId: this.config.chainId },
    )
    // Dont want wallet 0
    for (let i = startAt; i < startAt + count; i++) {
      const signer = this.createSigner(hdNode, i, mnemonic)

      // oxlint-disable-next-line no-await-in-loop
      const wallet = new Wallet(signer, i, await signer.getAddress())

      this.logger.info(`Wallet ${i}: ${wallet.getAddress()} `, {
        chainId: this.config.chainId,
        walletId: wallet.id,
        walletAddress: wallet.address,
      })

      this.releasedWallets.push(wallet)
    }
  }

  /**
   * Build Merkle tree for all global executor wallets
   * This generates addresses for ALL executor wallets across all regions,
   * not just the ones used by this region
   * @return {Promise<void>}
   */
  async buildMerkleTreeManager(seedPhrase: string): Promise<void> {
    const mnemonic = Mnemonic.fromPhrase(seedPhrase)
    const hdNode = HDNodeWallet.fromMnemonic(mnemonic)

    const totalWallets = this.config.totalGlobalWalletCount
    const addresses: string[] = []

    this.logger.info(
      `Building Merkle tree for ${totalWallets} global executor wallets (1-${totalWallets})`,
      { chainId: this.config.chainId },
    )

    // Generate addresses for wallets 1 through totalGlobalWalletCount
    // (skipping wallet 0, which is the master/refueling wallet)
    for (let i = 1; i <= totalWallets; i++) {
      const signer = this.createSigner(hdNode, i, mnemonic)
      // oxlint-disable-next-line no-await-in-loop
      const address = await signer.getAddress()
      addresses.push(address.toLowerCase())

      this.logger.debug(`Merkle tree wallet ${i}: ${address}`, {
        chainId: this.config.chainId,
        walletId: i,
        walletAddress: address,
      })
    }

    this._merkleTreeManager = new MerkleTreeManager(addresses)
  }

  /**
   *
   * @private
   * @param {HDNodeWallet} _hdNode
   * @param {number} index
   * @param {Mnemonic} mnemonic
   * @return {Signer}
   */
  private createSigner(_hdNode: HDNodeWallet, index: number, mnemonic: Mnemonic): Signer {
    const dPath = getIndexedAccountPath(index)
    this.logger.debug(`Wallet ${index}: Using path ${dPath}`, {
      chainId: this.config.chainId,
      walletId: index,
    })
    return HDNodeWallet.fromMnemonic(mnemonic, dPath)
  }

  /**
   * @return {number}
   */
  getAvailableWalletCount(): number {
    if (this.needNewProviderConnection) {
      return 0
    }
    return this.availableWallets.size()
  }

  /**
   * @return {Wallet | null}
   */
  requestWallet(): Wallet | null {
    if (this.availableWallets.isEmpty()) {
      this.logger.error("No wallets available!", { chainId: this.config.chainId })
      return null
    } else if (this.availableWallets.size() < 2) {
      this.logger.warn(`Only ${this.availableWallets.size()} wallets available!`, {
        chainId: this.config.chainId,
      })
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const wallet = this.availableWallets.shift()!

    if (wallet === undefined) {
      throw new Error("Tried to shift() an wallet, but got undefined")
    }

    wallet.connectToProvider(this.provider)

    this.busyWallets.push(wallet)

    return wallet
  }

  /**
   * @return {Wallet}
   */
  requestWalletNotNull(): Wallet {
    const wallet = this.requestWallet()

    if (!wallet) {
      throw new Error(
        "Requesting wallet when none is available if a breach of contract for this function",
      )
    }

    return wallet
  }

  /**
   *
   * @param {Wallet} wallet
   */
  releaseWallet(wallet: Wallet) {
    if (!this.busyWallets.remove(wallet)) {
      throw new Error(`Trying to release wallet that is not busy: ${wallet.getId()}`)
    }

    this.releasedWallets.push(wallet)
  }

  /**
   *
   * @param {Wallet} wallet
   * @return {Promise<bigint | null>}
   */
  async getGasBalance(wallet: Wallet): Promise<bigint | null> {
    try {
      this.logger.debug(`Checking balance for ${wallet.address}`, {
        chainId: this.config.chainId,
        walletId: wallet.id,
        walletAddress: wallet.address,
      })
      const balance = await this.provider.getBalance(wallet.getAddress())
      this.logger.debug(
        `Got balance ${parseFloat(ethers.formatEther(balance)).toFixed(3)} for wallet ${wallet.address}`,
        {
          chainId: this.config.chainId,
          walletId: wallet.id,
          walletAddress: wallet.address,
          walletBalance: balance.toString(),
        },
      )
      return balance
    } catch (e) {
      const message = `Got error while checking gas balance: ${e}`
      this.requestNewProviderConnection(message)
      return null
    }
  }

  /**
   * @return {Promise<void>}
   */
  async processReleasedWallets(): Promise<void> {
    this.runningProcesses++
    try {
      if (!this.releasedWallets.isEmpty()) {
        this.logger.debug(`Processing ${this.releasedWallets.size()} released wallets`, {
          chainId: this.config.chainId,
        })
      }

      if (this.needNewProviderConnection) {
        this.logger.warn("Awaiting new connection", { chainId: this.config.chainId })
        return
      }

      while (!this.releasedWallets.isEmpty()) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const wallet = this.releasedWallets.peek()!
        this.logger.info(`Processing Wallet ${wallet.id}: ${wallet.address}`, {
          chainId: this.config.chainId,
          walletId: wallet.id,
          walletAddress: wallet.address,
        })

        try {
          // oxlint-disable-next-line no-await-in-loop
          const gasBalance = await this.getGasBalance(wallet)
          if (gasBalance === null) {
            this.logger.warn("Got null when checking wallet balance, skipping", {
              chainId: this.config.chainId,
              walletId: wallet.id,
              walletAddress: wallet.address,
            })
            break
          } else if (gasBalance < this.balanceLowWatermark) {
            this.logger.info(
              `Wallet ${wallet.id} requires funding: ${parseFloat(ethers.formatEther(gasBalance)).toFixed(2)}`,
              {
                chainId: this.config.chainId,
                walletId: wallet.id,
                walletAddress: wallet.address,
                walletBalance: gasBalance.toString(),
              },
            )
            this.releasedWallets.remove(wallet)
            this.walletsNeedingFunding.push(wallet)
          } else {
            this.logger.debug(
              `Wallet ${wallet.id} has funding: ${parseFloat(ethers.formatEther(gasBalance)).toFixed(2)}`,
              {
                chainId: this.config.chainId,
                walletId: wallet.id,
                walletAddress: wallet.address,
                walletBalance: gasBalance.toString(),
              },
            )
            this.releasedWallets.remove(wallet)
            this.availableWallets.push(wallet)
          }
        } catch (e: any) {
          this.logger.error(`Got error when checking wallet: ${e}`, {
            chainId: this.config.chainId,
            walletId: wallet.id,
            walletAddress: wallet.address,
          })
          break
        }
      }
    } catch (e: any) {
      this.logger.error(`Got exception in processReleasedWallets(): ${e.message}`)
    } finally {
      if (!this.shutdownInProgress) {
        this.timerProcessReleasedWallets = setTimeout(
          () => this.processReleasedWallets(),
          this.config.processReleasedWalletsDelay,
        )
      }

      this.runningProcesses--
    }
  }

  /**
   * @return {Promise<void>}
   */
  async fuelNeedingWallets(): Promise<void> {
    this.runningProcesses++

    try {
      if (this.needNewProviderConnection) {
        this.logger.warn("Fueling waiting for connection", {
          chainId: this.config.chainId,
        })
        return
      }
      let wallet0Balance = await this.getGasBalance(this.wallet0)

      if (wallet0Balance === null) {
        this.logger.warn("Unable to fetch Wallet 0 balance, skipping", {
          chainId: this.config.chainId,
          walletId: this.wallet0.id,
          walletAddress: this.wallet0.address,
        })
        return
      }

      if (wallet0Balance < this.wallet0BalanceLowWatermark) {
        this.logger.warn(
          `Wallet 0 has a low balance of ${parseFloat(ethers.formatEther(wallet0Balance)).toFixed(2)} gas on chainId ${this.config.chainId}, ` +
            `the limit is ${parseInt(ethers.formatEther(this.wallet0BalanceLowWatermark), 10)}.`,
          {
            chainId: this.config.chainId,
            walletId: 0,
            walletAddress: this.wallet0.address,
            walletBalance: wallet0Balance.toString(),
          },
        )
      }

      this.logger.debug(
        `Wallet 0 (${this.wallet0.address}) has ${parseFloat(ethers.formatEther(wallet0Balance)).toFixed(2)} gas. ${this.walletsNeedingFunding.size()} wallets needs funding`,
        {
          chainId: this.config.chainId,
          walletId: this.wallet0.id,
          walletAddress: this.wallet0.address,
          walletBalance: wallet0Balance.toString(),
        },
      )
      const wallet0Signer = this.wallet0.getSigner().connect(this.provider)

      while (!this.walletsNeedingFunding.isEmpty()) {
        if (wallet0Balance < this.refuelAmount) {
          this.logger.error(`Wallet 0 (${this.wallet0.getAddress()}) is out of fuel`, {
            chainId: this.config.chainId,
            walletId: this.wallet0.id,
            walletAddress: this.wallet0.address,
            walletBalance: wallet0Balance.toString(),
          })
          break
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const wallet = this.walletsNeedingFunding.peek()!
        const address = wallet.getAddress()

        const tx = {
          to: address,
          value: this.refuelAmount,
          // gasPrice: ethers.parseUnits("way too much", "gwei"),
        }

        this.logger.info(
          `Fueling ${wallet.getAddress()} with ${ethers.formatEther(this.refuelAmount)}`,
          {
            chainId: this.config.chainId,
            walletId: wallet.id,
            walletAddress: wallet.address,
          },
        )

        let txResponse
        let result

        try {
          // oxlint-disable-next-line no-await-in-loop
          txResponse = await wallet0Signer.sendTransaction(tx)
        } catch (e) {
          throw new Error(
            `Got error when sending transaction to refuel ${wallet.address} with ${this.refuelAmount}: ${e}`,
            { cause: e },
          )
        }
        try {
          // oxlint-disable-next-line no-await-in-loop
          result = await txResponse.wait(1)
        } catch (e) {
          throw new Error(
            `Got error while waiting for confirmation of refuel ${wallet.address} with ${this.refuelAmount}: ${e}`,
            { cause: e },
          )
        }

        if (result?.status) {
          wallet0Balance -= this.refuelAmount
          this.logger.info(
            `Wallet ${address} successfully refueled with ${ethers.formatEther(this.refuelAmount)} gas in tx ${result.hash}`,
            {
              chainId: this.config.chainId,
              walletId: wallet.id,
              walletAddress: wallet.address,
              txHash: result.hash,
            },
          )
          this.walletsNeedingFunding.remove(wallet)
          this.availableWallets.push(wallet)
        } else {
          this.logger.error(`Failed to refuel wallet ${address} in tx ${result?.hash}`, {
            chainId: this.config.chainId,
            walletId: wallet.id,
            walletAddress: wallet.address,
            txHash: result?.hash,
          })
          this.walletsNeedingFunding.remove(wallet)
          this.releasedWallets.push(wallet)
        }
      }
    } finally {
      if (!this.shutdownInProgress) {
        this.timerFuelNeedingWallets = setTimeout(
          () => this.fuelNeedingWallets(),
          this.config.refuelDelay,
        )
      }

      this.runningProcesses--
    }
  }

  /**
   *
   */
  async connectionCheck() {
    this.runningProcesses++

    try {
      if (this.needNewProviderConnection) {
        this.logger.info(`Connecting to Provider: ${this.config.providerEndpoint}`, {
          chainId: this.config.chainId,
        })
        const provider = new ethers.JsonRpcProvider(
          this.config.providerEndpoint,
          this.config.chainId,
        )

        const network = await provider.getNetwork()
        this.logger.info(`New Provider connection on network: ${JSON.stringify(network)}`, {
          chainId: this.config.chainId,
        })

        this.needNewProviderConnection = false
        this._provider = provider
      }
    } catch (e) {
      this.logger.error(`Not able to connect to Provider: ${e}`, { chainId: this.config.chainId })
    } finally {
      if (!this.shutdownInProgress) {
        this.timerConnectionCheck = setTimeout(
          () => this.connectionCheck(),
          this.config.connectionCheckDelay,
        )
      }

      this.runningProcesses--
    }
  }

  /**
   * @param {string} reason
   */
  requestNewProviderConnection(reason: string) {
    this.logger.warn(`Got request for new Provider connection due to: ${reason}`, {
      chainId: this.config.chainId,
    })
    this.needNewProviderConnection = true
  }

  /**
   * @return {Promise<void>}
   */
  shutdown(): Promise<void> {
    this.logger.info("Shutting down WalletManager", { chainId: this.config.chainId })
    this.shutdownInProgress = true
    if (this.timerProcessReleasedWallets) {
      clearTimeout(this.timerProcessReleasedWallets)
    }
    if (this.timerFuelNeedingWallets) {
      clearTimeout(this.timerFuelNeedingWallets)
    }
    if (this.timerConnectionCheck) {
      clearTimeout(this.timerConnectionCheck)
    }

    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        this.logger.info(`Running processes: ${this.runningProcesses}`, {
          chainId: this.config.chainId,
        })
        if (this.runningProcesses === 0) {
          clearInterval(checkInterval)
          return resolve()
        }
      }, 1000)
    })
  }
}

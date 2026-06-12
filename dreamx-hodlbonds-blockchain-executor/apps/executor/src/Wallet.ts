import type { Provider, Signer } from "ethers"

import log4js, { type Logger } from "log4js"

export class Wallet {
  readonly id: number
  signer: Signer
  readonly address: string
  logger: Logger

  constructor(signer: Signer, id: number, address: string) {
    this.signer = signer
    this.id = id
    this.address = address
    this.logger = log4js.getLogger(`Wallet${id}`)
  }

  getId(): number {
    return this.id
  }

  getSigner(): Signer {
    return this.signer
  }

  getAddress(): string {
    return this.address
  }

  connectToProvider(provider: Provider) {
    this.signer = this.signer.connect(provider)
  }
}

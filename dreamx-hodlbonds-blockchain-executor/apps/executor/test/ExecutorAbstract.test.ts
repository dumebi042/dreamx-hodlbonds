import { schema } from "@dreamx-development/hodlbonds-blockchain-executor-database"
import { Network, Task } from "@dreamx-development/hodlbonds-blockchain-executor-dto"
import { sql } from "drizzle-orm"
import { type Signer, TransactionResponse } from "ethers"
import log4js, { type Logger } from "log4js"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { ExecutorConfig } from "@/schemas"

import { getDatabaseProvider } from "@/database/DatabaseProvider"
import { ExecutionResult } from "@/ExecutionResult"
import { ExecutorAbstract } from "@/ExecutorAbstract"

const mockSigner = {} as unknown as Signer

const mockExecutorConfig: ExecutorConfig = {
  minimumGasPrice: "10",
  maximumPriorityFeePerGas: "5",
  overBidPercent: 125,
}

const db = getDatabaseProvider().getDb()

const mockProcessSingleTransaction = vi.fn()
vi.mock("../src/ExecutionResult", () => {
  const ExecutionResult: any = vi.fn(function (this: any, _task: any) {
    this.processSingleTransaction = (...args: any[]) => mockProcessSingleTransaction(...args)
  })

  return {
    ExecutionResult,
    processSingleTransaction: (...args: any[]) => mockProcessSingleTransaction(...args),
  }
})

// oxlint-disable-next-line max-classes-per-file
class Wrapper extends ExecutorAbstract {
  override logger: Logger = log4js.getLogger(this.constructor.name)

  /**
   *
   * @param {Task} _task
   * @param {Signer} _signer
   */
  async execute(_task: Task, _signer: Signer): Promise<ExecutionResult> {
    return (await Promise.resolve({})) as unknown as Promise<ExecutionResult>
  }
}

describe("ExecutorAbstract", () => {
  beforeEach(async () => {
    await db.execute(sql`TRUNCATE TABLE contracts RESTART IDENTITY;`)
  })

  it("getContract: Throw on invalid contract name or network", async () => {
    expect.assertions(2)

    const wrongContractName = "$invalid contract name"
    const rightContractName = "SomeContract"

    const wrongNetwork = "err"
    const rightNetwork = Network.eth

    const executor = new Wrapper(mockExecutorConfig)

    await expect(() =>
      executor.getContract(wrongContractName, rightNetwork, mockSigner),
    ).rejects.toThrow(`Invalid contractName (${wrongContractName}) or network (${rightNetwork}`)

    await expect(() =>
      executor.getContract(rightContractName, wrongNetwork, mockSigner),
    ).rejects.toThrow(`Invalid contractName (${rightContractName}) or network (${wrongNetwork}`)
  })

  it("getContract: Throw on missing contract data in the database", async () => {
    expect.assertions(2)

    const executor = new Wrapper(mockExecutorConfig)
    const contractName = "SomeContract"
    const network = Network.eth

    // Entry doesn't exist at all
    await expect(() => executor.getContract(contractName, network, mockSigner)).rejects.toThrow(
      "Database didn't return address or abi for contract SomeContract on network eth",
    )

    // Missing data
    // Seed db with empty abi entry
    await db.insert(schema.contracts).values({
      contract_name: contractName,
      network,
      abi: "",
      address: "0x1234567890abcdef1234567890abcdef12345678",
    })

    await expect(() => executor.getContract(contractName, network, mockSigner)).rejects.toThrow(
      "Database didn't return address or abi for contract SomeContract on network eth. SpecAddres: null DbAddress: 0x1234567890abcdef1234567890abcdef12345678 UseAddress: 0x1234567890abcdef1234567890abcdef12345678, ABI: ",
    )
  })

  it("getContract: Returns the correct contract", async () => {
    expect.assertions(4)

    const contractName = "ContractName2"
    const network = Network.eth

    const mockAbi = [{ name: "someMethod", type: "function", inputs: [], outputs: [] }]
    const mockDbAddress = "0x1234567890abcdef1234567890abcdef12345678"
    const mockSpecAddress = "0x9876543210fedcba9876543210fedcba98765432"

    // Seed db with valid entry
    await db.insert(schema.contracts).values({
      contract_name: contractName,
      network,
      abi: mockAbi,
      address: mockDbAddress,
    })

    const executor = new Wrapper(mockExecutorConfig)

    const contract1 = await executor.getContract(contractName, network, mockSigner)
    await expect(contract1.getAddress()).resolves.toBe(mockDbAddress)
    expect(contract1.interface.fragments?.[0]).toMatchObject({ name: "someMethod", payable: true })

    const contract2 = await executor.getContract(contractName, network, mockSigner, mockSpecAddress)
    await expect(contract2.getAddress()).resolves.toBe(mockSpecAddress)
    expect(contract2.interface.fragments?.[0]).toMatchObject({ name: "someMethod", payable: true })
  })

  it("singleTransactionResult: Creates a ExecutionResult object and calls the process function", async () => {
    expect.assertions(3)

    const mockTask = "Some mocked task" as unknown as Task
    const mockFunction = vi
      .fn()
      .mockResolvedValue(
        "Some mocked transaction response promise" as unknown as Promise<TransactionResponse>,
      )
    const mockParams = ["abc", "123"]
    const mockResult = "Some mocked ExecutionResult" as unknown as ExecutionResult

    mockProcessSingleTransaction.mockReturnValue(mockResult)

    const executor = new Wrapper(mockExecutorConfig)

    const result = await executor.singleTransactionResult(mockTask, mockFunction, mockParams)

    expect(ExecutionResult).toHaveBeenCalledWith(mockTask)
    expect(mockProcessSingleTransaction).toHaveBeenCalledWith(mockFunction, mockParams)
    expect(result).toBe(mockResult)
  })
})

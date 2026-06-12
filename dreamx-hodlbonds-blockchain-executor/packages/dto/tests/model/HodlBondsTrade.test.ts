import { describe, it, expect, vi } from "vitest"

import type { HodlBondsTradeData, UniswapExactInData } from "@/model/HodlBondsTrade"

import {
  HodlBondsTradeOp,
  HodlBondsTradeDataSchema,
  HodlBondsTradeMessage,
  HodlBondsTradeTask,
} from "@/model/HodlBondsTrade"
import { Task } from "@/task"
import { captureZodError, mockMessage, mockTaskInput } from "@/utils/test-utils"

const mockHodlBondsTradeData: HodlBondsTradeData = {
  op: HodlBondsTradeOp.UNISWAP_EXACT_IN,
  clientOrderId: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
  poolAddress: "0x1234567890123456789012345678901234567890",
  quantity: "1000000000000000000",
  minAmountOut: "900000000000000000",
  deadline: 1716239023,
  zeroForOne: true,
}

describe("HodlBondsTrade DTO", () => {
  it("hodlBondsTradeDataValidator: Throws on missing data", () => {
    expect.assertions(16)

    const invalidTradeDataNoData = undefined
    const err = captureZodError(() => HodlBondsTradeDataSchema.parse(invalidTradeDataNoData))
    expect(err.issues[0]?.path[0]).toBe(undefined)
    expect(err.issues[0]?.message).toBe("Invalid input: expected object, received undefined")

    const invalidTradeDataNoOp = { ...mockHodlBondsTradeData, op: undefined }
    const err2 = captureZodError(() => HodlBondsTradeDataSchema.parse(invalidTradeDataNoOp))
    expect(err2.issues[0]?.path[0]).toBe("op")
    expect(err2.issues[0]?.message).toMatch("Invalid input")

    const invalidTradeDataNoClientOrderId = { ...mockHodlBondsTradeData, clientOrderId: undefined }
    const err2b = captureZodError(() =>
      HodlBondsTradeDataSchema.parse(invalidTradeDataNoClientOrderId),
    )
    expect(err2b.issues[0]?.path[0]).toBe("clientOrderId")
    expect(err2b.issues[0]?.message).toBe("Invalid input: expected string, received undefined")

    const invalidTradeDataNoPoolAddress = { ...mockHodlBondsTradeData, poolAddress: undefined }
    const err3 = captureZodError(() =>
      HodlBondsTradeDataSchema.parse(invalidTradeDataNoPoolAddress),
    )
    expect(err3.issues[0]?.path[0]).toBe("poolAddress")
    expect(err3.issues[0]?.message).toBe("Invalid input: expected string, received undefined")

    const invalidTradeDataNoQuantity = { ...mockHodlBondsTradeData, quantity: undefined }
    const err4 = captureZodError(() => HodlBondsTradeDataSchema.parse(invalidTradeDataNoQuantity))
    expect(err4.issues[0]?.path[0]).toBe("quantity")
    expect(err4.issues[0]?.message).toBe("Invalid input: expected string, received undefined")

    const invalidTradeDataNoMinAmountOut = { ...mockHodlBondsTradeData, minAmountOut: undefined }
    const err5 = captureZodError(() =>
      HodlBondsTradeDataSchema.parse(invalidTradeDataNoMinAmountOut),
    )
    expect(err5.issues[0]?.path[0]).toBe("minAmountOut")
    expect(err5.issues[0]?.message).toBe("Invalid input: expected string, received undefined")

    const invalidTradeDataNoDeadline = { ...mockHodlBondsTradeData, deadline: undefined }
    const err6 = captureZodError(() => HodlBondsTradeDataSchema.parse(invalidTradeDataNoDeadline))
    expect(err6.issues[0]?.path[0]).toBe("deadline")
    expect(err6.issues[0]?.message).toBe("Invalid input: expected number, received undefined")

    const invalidTradeDataNoZeroForOne = { ...mockHodlBondsTradeData, zeroForOne: undefined }
    const err7 = captureZodError(() => HodlBondsTradeDataSchema.parse(invalidTradeDataNoZeroForOne))
    expect(err7.issues[0]?.path[0]).toBe("zeroForOne")
    expect(err7.issues[0]?.message).toBe("Invalid input: expected boolean, received undefined")
  })

  it("hodlBondsTradeDataValidator: Throws on incorrect data", () => {
    expect.assertions(14)

    const invalidTradeDataInvalidOp = { ...mockHodlBondsTradeData, op: 22 }
    const err = captureZodError(() => HodlBondsTradeDataSchema.parse(invalidTradeDataInvalidOp))
    expect(err.issues[0]?.path[0]).toBe("op")
    expect(err.issues[0]?.message).toMatch("Invalid input")

    const invalidTradeDataInvalidClientOrderId = {
      ...mockHodlBondsTradeData,
      clientOrderId: "not-valid-uuid",
    }
    const err1b = captureZodError(() =>
      HodlBondsTradeDataSchema.parse(invalidTradeDataInvalidClientOrderId),
    )
    expect(err1b.issues[0]?.path[0]).toBe("clientOrderId")
    expect(err1b.issues[0]?.message).toMatch("32")

    const invalidTradeDataInvalidPoolAddress = {
      ...mockHodlBondsTradeData,
      poolAddress: "not an address",
    }
    const err2 = captureZodError(() =>
      HodlBondsTradeDataSchema.parse(invalidTradeDataInvalidPoolAddress),
    )
    expect(err2.issues[0]?.path[0]).toBe("poolAddress")
    expect(err2.issues[0]?.message).toBe("Invalid Ethereum address")

    const invalidTradeDataInvalidQuantity = { ...mockHodlBondsTradeData, quantity: "not a number" }
    const err3 = captureZodError(() =>
      HodlBondsTradeDataSchema.parse(invalidTradeDataInvalidQuantity),
    )
    expect(err3.issues[0]?.path[0]).toBe("quantity")
    expect(err3.issues[0]?.message).toBe("Invalid positive integer string")

    const invalidTradeDataNegativeQuantity = {
      ...mockHodlBondsTradeData,
      quantity: "-1000000000000000000",
    }
    const err4 = captureZodError(() =>
      HodlBondsTradeDataSchema.parse(invalidTradeDataNegativeQuantity),
    )
    expect(err4.issues[0]?.path[0]).toBe("quantity")
    expect(err4.issues[0]?.message).toBe("Invalid positive integer string")

    const invalidTradeDataInvalidDeadline = { ...mockHodlBondsTradeData, deadline: 100 }
    const err5 = captureZodError(() =>
      HodlBondsTradeDataSchema.parse(invalidTradeDataInvalidDeadline),
    )
    expect(err5.issues[0]?.path[0]).toBe("deadline")
    expect(err5.issues[0]?.message).toBe("Too small: expected number to be >=1000000000")

    const invalidTradeDataInvalidZeroForOne = {
      ...mockHodlBondsTradeData,
      zeroForOne: "not a bool",
    }
    const err6 = captureZodError(() =>
      HodlBondsTradeDataSchema.parse(invalidTradeDataInvalidZeroForOne),
    )
    expect(err6.issues[0]?.path[0]).toBe("zeroForOne")
    expect(err6.issues[0]?.message).toBe("Invalid input: expected boolean, received string")
  })

  it("hodlBondsTradeDataValidator: Validates correct data", () => {
    expect.assertions(1)

    const validTradeData = { ...mockHodlBondsTradeData }
    const result = HodlBondsTradeDataSchema.parse(validTradeData)
    expect(result).toEqual(mockHodlBondsTradeData)
  })

  it("Message constructor: Able to instantiate with correct data", () => {
    expect.assertions(8)

    const validatorSpy = vi.spyOn(HodlBondsTradeDataSchema, "parse")

    const validTradeMessage: HodlBondsTradeMessage = {
      ...mockMessage,
      data: mockHodlBondsTradeData,
    }

    const message = new HodlBondsTradeMessage(validTradeMessage)
    const typedData = message.data as UniswapExactInData
    expect(validatorSpy).toHaveBeenCalledExactlyOnceWith(validTradeMessage.data)
    expect(typedData.op).toBe(mockHodlBondsTradeData.op)
    expect(typedData.clientOrderId).toBe(mockHodlBondsTradeData.clientOrderId)
    expect(typedData.poolAddress).toBe(mockHodlBondsTradeData.poolAddress)
    expect(typedData.quantity).toBe(mockHodlBondsTradeData.quantity)
    expect(typedData.minAmountOut).toBe(mockHodlBondsTradeData.minAmountOut)
    expect(typedData.deadline).toBe(mockHodlBondsTradeData.deadline)
    expect(typedData.zeroForOne).toBe(mockHodlBondsTradeData.zeroForOne)
  })

  it("Task constructor: Able to instantiate with correct data", () => {
    expect.assertions(8)

    const validatorSpy = vi.spyOn(HodlBondsTradeDataSchema, "parse")

    const validTradeTask = new Task({ ...mockTaskInput, data: mockHodlBondsTradeData })

    const task = new HodlBondsTradeTask(validTradeTask)
    const typedData = task.data as UniswapExactInData
    expect(validatorSpy).toHaveBeenCalledExactlyOnceWith(validTradeTask.data)
    expect(typedData.op).toBe(mockHodlBondsTradeData.op)
    expect(typedData.clientOrderId).toBe(mockHodlBondsTradeData.clientOrderId)
    expect(typedData.poolAddress).toBe(mockHodlBondsTradeData.poolAddress)
    expect(typedData.quantity).toBe(mockHodlBondsTradeData.quantity)
    expect(typedData.minAmountOut).toBe(mockHodlBondsTradeData.minAmountOut)
    expect(typedData.deadline).toBe(mockHodlBondsTradeData.deadline)
    expect(typedData.zeroForOne).toBe(mockHodlBondsTradeData.zeroForOne)
  })

  it("HodlBondsTradeTask.fromTask: Able to instantiate with correct data", () => {
    expect.assertions(8)

    const validatorSpy = vi.spyOn(HodlBondsTradeDataSchema, "parse")

    const validTradeTask = new Task({ ...mockTaskInput, data: mockHodlBondsTradeData })

    const task = HodlBondsTradeTask.fromTask(validTradeTask)
    const typedData = task.data as UniswapExactInData
    expect(validatorSpy).toHaveBeenCalledExactlyOnceWith(validTradeTask.data)
    expect(typedData.op).toBe(mockHodlBondsTradeData.op)
    expect(typedData.clientOrderId).toBe(mockHodlBondsTradeData.clientOrderId)
    expect(typedData.poolAddress).toBe(mockHodlBondsTradeData.poolAddress)
    expect(typedData.quantity).toBe(mockHodlBondsTradeData.quantity)
    expect(typedData.minAmountOut).toBe(mockHodlBondsTradeData.minAmountOut)
    expect(typedData.deadline).toBe(mockHodlBondsTradeData.deadline)
    expect(typedData.zeroForOne).toBe(mockHodlBondsTradeData.zeroForOne)
  })
})

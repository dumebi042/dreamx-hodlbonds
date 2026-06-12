import type { $ZodIssueInvalidType } from "zod/v4/core"

import { describe, it, expect, vi } from "vitest"

import type { DcaBotData, DcaBotBuyOrder } from "@/model/DcaBot"

import { DcaBotTask, DcaBotMessage, DcaBotDataSchema, DcaBotBuyOrderSchema } from "@/model/DcaBot"
import { Task } from "@/task"
import { captureZodError, mockMessage, mockTaskInput } from "@/utils/test-utils"

const mockDcaBotBuyOrder = {
  address: "0x0000000000000000000000000000000000000000",
  dollarAmount: 100,
  active: true,
  decimals: 18,
} as DcaBotBuyOrder

const mockDcaBotData: DcaBotData = {
  tokenToSell: "0x0000000000000000000000000000000000000000",
  tokenToSellDecimals: 18,
  baseDollarToken: "0x0000000000000000000000000000000000000000",
  baseDollarDecimals: 6,
  buyOrders: [mockDcaBotBuyOrder],
}

describe("DCA Bot DTO", () => {
  it("dcaBotDataValidator: Throws on missing data", () => {
    expect.assertions(10)

    const fields = Object.keys(mockDcaBotData)

    for (const field of fields) {
      const invalidDcaBotData: DcaBotData = { ...mockDcaBotData }
      delete invalidDcaBotData[field as keyof DcaBotData]

      const err = captureZodError(() => DcaBotDataSchema.parse(invalidDcaBotData))
      expect(err.issues[0]?.path[0]).toBe(field)
      expect(err.issues[0]?.message).toBe(
        `Invalid input: expected ${(err.issues[0] as $ZodIssueInvalidType)?.expected}, received undefined`,
      )
    }
  })

  it("dcaBotDataValidator: Throws on incorrect data", () => {
    expect.assertions(12)

    const fields = Object.keys(mockDcaBotData)

    for (const field of fields) {
      const invalidDcaBotData: DcaBotData = { ...mockDcaBotData, [field]: "Invalid data #$%" }

      const err = captureZodError(() => DcaBotDataSchema.parse(invalidDcaBotData))
      expect(err.issues[0]?.path[0]).toBe(field)
      // oxlint-disable-next-line no-conditional-in-test
      if (field === "tokenToSell" || field === "baseDollarToken") {
        // oxlint-disable-next-line no-conditional-expect
        expect(err.issues[0]?.message).toBe("Invalid Ethereum address")
      } else {
        // oxlint-disable-next-line no-conditional-expect
        expect(err.issues[0]?.message).toBe(
          `Invalid input: expected ${(err.issues[0] as $ZodIssueInvalidType)?.expected}, received string`,
        )
      }
    }

    const invalidDcaBotDataBuyOrders = {
      ...mockDcaBotData,
      buyOrders: [
        {
          ...mockDcaBotBuyOrder,
          active: "garbage",
        },
      ],
    }

    const err = captureZodError(() => DcaBotDataSchema.parse(invalidDcaBotDataBuyOrders))
    expect(err.issues[0]?.path[0]).toBe("buyOrders")
    expect(err.issues[0]?.message).toBe(
      `Invalid input: expected ${(err.issues[0] as $ZodIssueInvalidType)?.expected}, received string`,
    )
  })

  it("dcaBotDataBuyOrderValidator: Throws on missing data", () => {
    expect.assertions(8)

    const fields = Object.keys(mockDcaBotBuyOrder)

    for (const field of fields) {
      const invalidDcaBotBuyOrderData: DcaBotBuyOrder = { ...mockDcaBotBuyOrder }
      delete invalidDcaBotBuyOrderData[field as keyof DcaBotBuyOrder]

      const err = captureZodError(() => DcaBotBuyOrderSchema.parse(invalidDcaBotBuyOrderData))
      expect(err.issues[0]?.path[0]).toBe(field)
      expect(err.issues[0]?.message).toBe(
        `Invalid input: expected ${(err.issues[0] as $ZodIssueInvalidType)?.expected}, received undefined`,
      )
    }
  })

  it("dcaBotDataBuyOrderValidator: Throws on incorrect data", () => {
    expect.assertions(8)

    const fields = Object.keys(mockDcaBotBuyOrder)

    for (const field of fields) {
      const invalidDcaBotBuyOrderData: any = { ...mockDcaBotBuyOrder, [field]: "Invalid data #$%" }

      const err = captureZodError(() => DcaBotBuyOrderSchema.parse(invalidDcaBotBuyOrderData))
      expect(err.issues[0]?.path[0]).toBe(field)
      // oxlint-disable-next-line no-conditional-in-test
      if (field === "address") {
        // oxlint-disable-next-line no-conditional-expect
        expect(err.issues[0]?.message).toBe("Invalid Ethereum address")
      } else {
        // oxlint-disable-next-line no-conditional-expect
        expect(err.issues[0]?.message).toBe(
          `Invalid input: expected ${(err.issues[0] as $ZodIssueInvalidType)?.expected}, received string`,
        )
      }
    }
  })

  it("Message constructor: Able to instantiate with correct data", () => {
    expect.assertions(5)

    const validatorSpy = vi.spyOn(DcaBotDataSchema, "parse")

    const validDcaBotMessage = {
      ...mockMessage,
      data: mockDcaBotData,
    } as DcaBotMessage

    const message = new DcaBotMessage(validDcaBotMessage)
    expect(validatorSpy).toHaveBeenCalledExactlyOnceWith(validDcaBotMessage.data)
    expect(message.data.tokenToSell).toBe(mockDcaBotData.tokenToSell)
    expect(message.data.baseDollarToken).toBe(mockDcaBotData.baseDollarToken)
    expect(message.data.baseDollarDecimals).toBe(mockDcaBotData.baseDollarDecimals)
    expect(message.data.buyOrders).toStrictEqual(mockDcaBotData.buyOrders)
  })

  it("Task constructor: Able to instantiate with correct data", () => {
    expect.assertions(5)

    const validatorSpy = vi.spyOn(DcaBotDataSchema, "parse")

    const validDcaBotTask = new Task({
      ...mockTaskInput,
      data: mockDcaBotData,
    })

    const task = new DcaBotTask(validDcaBotTask)
    expect(validatorSpy).toHaveBeenCalledExactlyOnceWith(validDcaBotTask.data)
    expect(task.data.tokenToSell).toBe(mockDcaBotData.tokenToSell)
    expect(task.data.baseDollarToken).toBe(mockDcaBotData.baseDollarToken)
    expect(task.data.baseDollarDecimals).toBe(mockDcaBotData.baseDollarDecimals)
    expect(task.data.buyOrders).toStrictEqual(mockDcaBotData.buyOrders)
  })

  it("DcaBotTask.fromTask: Able to instantiate with correct data", () => {
    expect.assertions(5)

    const validatorSpy = vi.spyOn(DcaBotDataSchema, "parse")

    const validDcaBotTask = new Task({
      ...mockTaskInput,
      data: mockDcaBotData,
    })

    const task = DcaBotTask.fromTask(validDcaBotTask)
    expect(validatorSpy).toHaveBeenCalledExactlyOnceWith(validDcaBotTask.data)
    expect(task.data.tokenToSell).toBe(mockDcaBotData.tokenToSell)
    expect(task.data.baseDollarToken).toBe(mockDcaBotData.baseDollarToken)
    expect(task.data.baseDollarDecimals).toBe(mockDcaBotData.baseDollarDecimals)
    expect(task.data.buyOrders).toStrictEqual(mockDcaBotData.buyOrders)
  })
})

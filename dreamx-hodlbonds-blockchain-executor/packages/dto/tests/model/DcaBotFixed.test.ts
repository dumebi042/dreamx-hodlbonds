import type { $ZodIssueInvalidType } from "zod/v4/core"

import { describe, it, expect, vi } from "vitest"

import type { DcaBotFixedData, DcaBotFixedBuyOrder } from "@/model/DcaBotFixed"

import {
  DcaBotFixedTask,
  DcaBotFixedMessage,
  DcaBotFixedDataSchema,
  DcaBotFixedBuyOrderSchema,
} from "@/model/DcaBotFixed"
import { Task } from "@/task"
import { captureZodError, mockMessage, mockTaskInput } from "@/utils/test-utils"

const mockDcaBotFixedBuyOrder: DcaBotFixedBuyOrder = {
  address: "0x0000000000000000000000000000000000000000",
  tokenToSellAmount: 100,
  active: true,
  decimals: 18,
}

const mockDcaBotFixedData: DcaBotFixedData = {
  tokenToSell: "0x0000000000000000000000000000000000000000",
  tokenToSellDecimals: 18,
  buyOrders: [mockDcaBotFixedBuyOrder],
}

describe("DCA Bot Fixed Amount DTO", () => {
  it("dcaBotFixedDataValidator: Throws on missing data", () => {
    expect.assertions(6)

    const fields = Object.keys(mockDcaBotFixedData)

    for (const field of fields) {
      const invalidDcaBotFixedData: DcaBotFixedData = { ...mockDcaBotFixedData }
      delete invalidDcaBotFixedData[field as keyof DcaBotFixedData]

      const err = captureZodError(() => DcaBotFixedDataSchema.parse(invalidDcaBotFixedData))
      expect(err.issues[0]?.path[0]).toBe(field)
      expect(err.issues[0]?.message).toBe(
        `Invalid input: expected ${(err.issues[0] as $ZodIssueInvalidType)?.expected}, received undefined`,
      )
    }
  })

  it("dcaBotFixedDataValidator: Throws on incorrect data", () => {
    expect.assertions(8)

    const fields = Object.keys(mockDcaBotFixedData)

    for (const field of fields) {
      const invalidDcaBotFixedData: DcaBotFixedData = {
        ...mockDcaBotFixedData,
        [field]: "Invalid data #$%",
      }

      const err = captureZodError(() => DcaBotFixedDataSchema.parse(invalidDcaBotFixedData))
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

    const invalidDcaBotFixedDataBuyOrders = {
      ...mockDcaBotFixedData,
      buyOrders: [
        {
          ...mockDcaBotFixedBuyOrder,
          active: "garbage",
        },
      ],
    }

    const err = captureZodError(() => DcaBotFixedDataSchema.parse(invalidDcaBotFixedDataBuyOrders))
    expect(err.issues[0]?.path[0]).toBe("buyOrders")
    expect(err.issues[0]?.message).toBe(
      `Invalid input: expected ${(err.issues[0] as $ZodIssueInvalidType)?.expected}, received string`,
    )
  })

  it("dcaBotFixedBuyOrderValidator: Throws on missing data", () => {
    expect.assertions(8)

    const fields = Object.keys(mockDcaBotFixedBuyOrder)

    for (const field of fields) {
      const invalidDcaBotFixedBuyOrderData: DcaBotFixedBuyOrder = { ...mockDcaBotFixedBuyOrder }
      delete invalidDcaBotFixedBuyOrderData[field as keyof DcaBotFixedBuyOrder]
      const err = captureZodError(() =>
        DcaBotFixedBuyOrderSchema.parse(invalidDcaBotFixedBuyOrderData),
      )
      expect(err.issues[0]?.path[0]).toBe(field)
      expect(err.issues[0]?.message).toBe(
        `Invalid input: expected ${(err.issues[0] as $ZodIssueInvalidType)?.expected}, received undefined`,
      )
    }
  })

  it("dcaBotFixedBuyOrderValidator: Throws on incorrect data", () => {
    expect.assertions(8)

    const fields = Object.keys(mockDcaBotFixedBuyOrder)

    for (const field of fields) {
      const invalidDcaBotFixedBuyOrderData: any = {
        ...mockDcaBotFixedBuyOrder,
        [field]: "Invalid data #$%",
      }

      const err = captureZodError(() =>
        DcaBotFixedBuyOrderSchema.parse(invalidDcaBotFixedBuyOrderData),
      )
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
    expect.assertions(4)

    const validatorSpy = vi.spyOn(DcaBotFixedDataSchema, "parse")

    const validDcaBotMessage: DcaBotFixedMessage = {
      ...mockMessage,
      data: mockDcaBotFixedData,
    }

    const message = new DcaBotFixedMessage(validDcaBotMessage)
    expect(validatorSpy).toHaveBeenCalledExactlyOnceWith(validDcaBotMessage.data)
    expect(message.data.tokenToSell).toBe(mockDcaBotFixedData.tokenToSell)
    expect(message.data.tokenToSellDecimals).toBe(mockDcaBotFixedData.tokenToSellDecimals)
    expect(message.data.buyOrders).toStrictEqual(mockDcaBotFixedData.buyOrders)
  })

  it("Task constructor: Able to instantiate with correct data", () => {
    expect.assertions(4)

    const validatorSpy = vi.spyOn(DcaBotFixedDataSchema, "parse")

    const validDcaBotTask = new Task({
      ...mockTaskInput,
      data: mockDcaBotFixedData,
    })

    const task = new DcaBotFixedTask(validDcaBotTask)
    expect(validatorSpy).toHaveBeenCalledExactlyOnceWith(validDcaBotTask.data)
    expect(task.data.tokenToSell).toBe(mockDcaBotFixedData.tokenToSell)
    expect(task.data.tokenToSellDecimals).toBe(mockDcaBotFixedData.tokenToSellDecimals)
    expect(task.data.buyOrders).toStrictEqual(mockDcaBotFixedData.buyOrders)
  })

  it("DcaBotFixedTask.fromTask: Able to instantiate with correct data", () => {
    expect.assertions(4)

    const validatorSpy = vi.spyOn(DcaBotFixedDataSchema, "parse")

    const validDcaBotTask = new Task({
      ...mockTaskInput,
      data: mockDcaBotFixedData,
    })

    const task = DcaBotFixedTask.fromTask(validDcaBotTask)
    expect(validatorSpy).toHaveBeenCalledExactlyOnceWith(validDcaBotTask.data)
    expect(task.data.tokenToSell).toBe(mockDcaBotFixedData.tokenToSell)
    expect(task.data.tokenToSellDecimals).toBe(mockDcaBotFixedData.tokenToSellDecimals)
    expect(task.data.buyOrders).toStrictEqual(mockDcaBotFixedData.buyOrders)
  })
})

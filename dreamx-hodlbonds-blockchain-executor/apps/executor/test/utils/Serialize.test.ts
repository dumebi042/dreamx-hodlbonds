import { describe, expect, it } from "vitest"

import { serializeJsonWithBigInt } from "@/utils/Serialize"

describe("serializeJsonWithBigInt", () => {
  it("should serialize objects with bigint values", () => {
    expect.assertions(1)

    const obj = {
      normalNumber: 123,
      bigNumber: BigInt("9007199254740991"),
      normalString: "test",
    }

    const result = serializeJsonWithBigInt(obj)
    const expected = '{"normalNumber":123,"bigNumber":"9007199254740991","normalString":"test"}'

    expect(result).toBe(expected)
  })

  it("should serialize objects without bigint values", () => {
    expect.assertions(1)

    const obj = {
      number: 42,
      string: "hello",
      boolean: true,
      null: null,
    }

    const result = serializeJsonWithBigInt(obj)
    const expected = '{"number":42,"string":"hello","boolean":true,"null":null}'

    expect(result).toBe(expected)
  })

  it("should handle nested objects with bigint", () => {
    expect.assertions(1)

    const obj = {
      nested: {
        value: BigInt("123456789"),
      },
      array: [1, BigInt("999"), "test"],
    }

    const result = serializeJsonWithBigInt(obj)
    const expected = '{"nested":{"value":"123456789"},"array":[1,"999","test"]}'

    expect(result).toBe(expected)
  })
})

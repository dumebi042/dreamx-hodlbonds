import { describe, it, expect } from "vitest"

import { EthereumAddress, PositiveIntegerString, UnixTimestampSecondsAfter2001 } from "@/schemas"
import { captureZodError } from "@/utils/test-utils"

describe("Custom Schemas", () => {
  it("EthereumAddress: Accepts valid addresses", () => {
    expect.assertions(3)

    const validAddress1 = "0x1234567890abcdef1234567890abcdef12345678"
    expect(EthereumAddress.parse(validAddress1)).toBe(validAddress1)

    const validAddress2 = "0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD"
    expect(EthereumAddress.parse(validAddress2)).toBe(validAddress2)

    const validAddress3 = "0x0000000000000000000000000000000000000000"
    expect(EthereumAddress.parse(validAddress3)).toBe(validAddress3)
  })

  it("EthereumAddress: Throws on invalid address", () => {
    expect.assertions(4)

    const invalidAddressShort = "0x12345"
    const err = captureZodError(() => EthereumAddress.parse(invalidAddressShort))
    expect(err.issues[0]?.message).toBe("Invalid Ethereum address")

    const invalidAddressLong = "0x1234567890abcdef1234567890abcdef1234567890"
    const err2 = captureZodError(() => EthereumAddress.parse(invalidAddressLong))
    expect(err2.issues[0]?.message).toBe("Invalid Ethereum address")

    const invalidAddressNoPrefix = "1234567890abcdef1234567890abcdef12345678"
    const err3 = captureZodError(() => EthereumAddress.parse(invalidAddressNoPrefix))
    expect(err3.issues[0]?.message).toBe("Invalid Ethereum address")

    const invalidAddressNonHex = "0xGHIJKLMNOPQRSTUVWXYZ1234567890abcdef1234"
    const err4 = captureZodError(() => EthereumAddress.parse(invalidAddressNonHex))
    expect(err4.issues[0]?.message).toBe("Invalid Ethereum address")
  })

  it("UnixTimestampSecondsAfter2001: Accepts valid timestamps", () => {
    expect.assertions(2)

    const validTimestamp1 = 1000000000 // September 9, 2001
    expect(UnixTimestampSecondsAfter2001.parse(validTimestamp1)).toBe(validTimestamp1)

    const validTimestamp2 = 1609459200 // January 1, 2021
    expect(UnixTimestampSecondsAfter2001.parse(validTimestamp2)).toBe(validTimestamp2)
  })

  it("UnixTimestampSecondsAfter2001: Throws on invalid timestamps", () => {
    expect.assertions(2)

    const invalidTimestampNegative = -1000
    const err = captureZodError(() => UnixTimestampSecondsAfter2001.parse(invalidTimestampNegative))
    expect(err.issues[0]?.message).toBe("Too small: expected number to be >=1000000000")

    const invalidTimestampTooSmall = 999999999
    const err2 = captureZodError(() =>
      UnixTimestampSecondsAfter2001.parse(invalidTimestampTooSmall),
    )
    expect(err2.issues[0]?.message).toBe("Too small: expected number to be >=1000000000")
  })

  it("PositiveIntegerString: Accepts valid positive integer strings", () => {
    expect.assertions(3)

    const validString1 = "1"
    expect(PositiveIntegerString.parse(validString1)).toBe(validString1)

    const validString2 = "1234567890"
    expect(PositiveIntegerString.parse(validString2)).toBe(validString2)

    const validString3 = "9999999999999999999999999999"
    expect(PositiveIntegerString.parse(validString3)).toBe(validString3)
  })

  it("PositiveIntegerString: Throws on invalid positive integer strings", () => {
    expect.assertions(5)

    const invalidStringZero = "0"
    const err = captureZodError(() => PositiveIntegerString.parse(invalidStringZero))
    expect(err.issues[0]?.message).toBe("Invalid positive integer string")

    const invalidStringNegative = "-123"
    const err2 = captureZodError(() => PositiveIntegerString.parse(invalidStringNegative))
    expect(err2.issues[0]?.message).toBe("Invalid positive integer string")

    const invalidStringDecimal = "12.34"
    const err3 = captureZodError(() => PositiveIntegerString.parse(invalidStringDecimal))
    expect(err3.issues[0]?.message).toBe("Invalid positive integer string")

    const invalidStringNonNumeric = "abc123"
    const err4 = captureZodError(() => PositiveIntegerString.parse(invalidStringNonNumeric))
    expect(err4.issues[0]?.message).toBe("Invalid positive integer string")

    const invalidStringEmpty = ""
    const err5 = captureZodError(() => PositiveIntegerString.parse(invalidStringEmpty))
    expect(err5.issues[0]?.message).toBe("Invalid positive integer string")
  })
})

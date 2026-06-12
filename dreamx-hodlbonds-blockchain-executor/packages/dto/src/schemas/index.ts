import * as z from "zod"

/**
 * A Zod schema that validates Ethereum addresses.
 * Ensures the string matches the format: 0x followed by 40 hexadecimal characters.
 *
 * @example
 * ```typescript
 * EthereumAddress.parse("0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"); // valid
 * EthereumAddress.parse("invalid"); // throws ZodError
 * ```
 */

export const EthereumAddress = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address") as z.ZodType<`0x${string}`>

/**
 * A Zod schema that validates Unix timestamps in seconds.
 * Ensures the number is an integer greater than or equal to 1000000000 (September 9, 2001).
 *
 * @example
 * ```typescript
 * UnixTimestampSecondsAfter2001.parse(1609459200); // valid (Jan 1, 2021)
 * UnixTimestampSecondsAfter2001.parse(999999999); // throws ZodError
 * ```
 */
export const UnixTimestampSecondsAfter2001 = z.number().int().min(1000000000)

export const PositiveIntegerString = z
  .string()
  .regex(/^[1-9]\d*$/, "Invalid positive integer string")

// /**
//  * A Zod codec that converts between string representations of integers and actual integer values.
//  * Decodes string integers (e.g., "42") into numbers and encodes numbers back into strings.
//  * Useful for scenarios where numeric values are transmitted as strings, such as in JSON payloads.
//  *
//  * @example
//  * ```typescript
//  * stringToInt.decode("42");  // returns 42
//  * stringToInt.encode(42);    // returns "42"
//  * stringToInt.decode("abc"); // throws ZodError
//  * ```
//  */
// export const stringToInt = z.codec(z.string().regex(z.regexes.integer), z.int(), {
//   decode: (str) => Number.parseInt(str, 10),
//   encode: (num) => num.toString(),
// })

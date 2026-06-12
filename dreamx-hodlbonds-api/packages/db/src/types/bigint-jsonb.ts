import { customType } from "drizzle-orm/pg-core"

/**
 * Tagged BigInt value for JSON serialization
 * Used to preserve BigInt types when storing in JSONB columns
 */
interface TaggedBigInt {
  value: string
  __type: "bigint"
}

/**
 * Type guard to check if a value is a tagged BigInt
 */
function isTaggedBigInt(value: unknown): value is TaggedBigInt {
  return (
    typeof value === "object" &&
    value !== null &&
    "__type" in value &&
    (value as TaggedBigInt).__type === "bigint" &&
    "value" in value &&
    typeof (value as TaggedBigInt).value === "string"
  )
}

/**
 * Recursively serialize a value, converting BigInt to tagged format
 * Handles nested objects and arrays
 */
function serializeWithBigInt(value: unknown): unknown {
  if (typeof value === "bigint") {
    return { value: value.toString(), __type: "bigint" } satisfies TaggedBigInt
  }

  if (Array.isArray(value)) {
    return value.map((v) => serializeWithBigInt(v))
  }

  if (typeof value === "object" && value !== null) {
    const result: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value)) {
      result[key] = serializeWithBigInt(val)
    }
    return result
  }

  return value
}

/**
 * Recursively deserialize a value, converting tagged format back to BigInt
 * Handles nested objects and arrays
 */
function deserializeWithBigInt(value: unknown): unknown {
  if (isTaggedBigInt(value)) {
    return BigInt(value.value)
  }

  if (Array.isArray(value)) {
    return value.map((v) => deserializeWithBigInt(v))
  }

  if (typeof value === "object" && value !== null) {
    const result: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value)) {
      result[key] = deserializeWithBigInt(val)
    }
    return result
  }

  return value
}

/**
 * Custom Drizzle type for JSONB columns that contain BigInt values
 *
 * Automatically serializes BigInt values as `{value: "123", __type: "bigint"}`
 * and deserializes them back to native BigInt when reading from the database.
 *
 * Works with arbitrarily nested objects and arrays.
 *
 * @example
 * // In schema definition:
 * args: bigintJsonb("args")
 *
 * // When inserting:
 * { vaultId: 42n, nested: { amount: 1000n } }
 *
 * // Stored in DB as:
 * { vaultId: {value: "42", __type: "bigint"}, nested: { amount: {value: "1000", __type: "bigint"} } }
 *
 * // When reading:
 * { vaultId: 42n, nested: { amount: 1000n } }
 */
export const bigintJsonb = customType<{ data: unknown }>({
  dataType() {
    return "jsonb"
  },
  toDriver(value: unknown): unknown {
    return serializeWithBigInt(value)
  },
  fromDriver(value: unknown): unknown {
    return deserializeWithBigInt(value)
  },
})

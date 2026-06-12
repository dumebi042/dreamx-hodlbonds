import { describe, it, expect } from "vitest"

import { canonicalize, computeHash } from "@/utils/canonical"

describe("canonical utils", () => {
  it("canonicalize stable ordering and primitive handling", () => {
    const a = { b: 1, a: 2 }
    const b = { a: 2, b: 1 }
    expect(canonicalize(a)).toBe(canonicalize(b))
    expect(canonicalize(null)).toBe("null")
    expect(canonicalize("x")).toBe(JSON.stringify("x"))
    expect(canonicalize(123)).toBe(JSON.stringify(123))
  })

  it("computeHash invariant to key order and JSON-string data", () => {
    const baseMessage = {
      network: "tst",
      executor: "UnitTest",
      earliestTry: 1691680555,
      data: { datString: "some string", dataNumber: 999 },
    }

    const reordered = {
      ...baseMessage,
      data: { dataNumber: 999, datString: "some string" },
    }

    const jsonStringMessage = { ...baseMessage, data: JSON.stringify(baseMessage.data) }

    // simulate Zod preprocess: parse the JSON string into an object before hashing
    const parsedJsonStringMessage = {
      ...jsonStringMessage,
      data: JSON.parse(jsonStringMessage.data as string),
    }

    const h1 = computeHash(baseMessage as any)
    const h2 = computeHash(reordered as any)
    const h3 = computeHash(parsedJsonStringMessage as any)

    expect(h1).toBe(h2)
    expect(h1).toBe(h3)
  })

  it("canonicalize arrays and nested BigInt", () => {
    const obj: any = { arr: [1n, { k: 2n }], s: "x" }
    const c = canonicalize(obj)
    // BigInt values are represented as JSON strings of their decimal value
    expect(c).toContain('"1"')
    expect(c).toContain('"2"')
    // stable on repeat
    expect(canonicalize(obj)).toBe(canonicalize(obj))
  })

  it("canonicalize handles uncovered types", () => {
    // oxlint-disable-next-line consistent-function-scoping
    const fn = () => {}
    const result = canonicalize(fn)
    expect(result).toBe(JSON.stringify(fn))
  })
})

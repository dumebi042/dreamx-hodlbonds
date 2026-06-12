import { vi, describe, it, expect } from "vitest"

import { getDatabaseProvider, DatabaseProvider } from "@/database/DatabaseProvider"

describe("DatabaseProvider", () => {
  it("getDatabaseProvider: Returns a DatabaseProvider object", () => {
    expect.assertions(1)

    const dbProvider = getDatabaseProvider()

    expect(dbProvider).toStrictEqual(new DatabaseProvider())
  })

  it("getDb: Returns cached connection on second call", () => {
    expect.assertions(3)

    const con0 = "Database connection"
    const mockConnect = vi.fn().mockReturnValueOnce(con0)

    const db = new DatabaseProvider()
    db.connect = mockConnect

    const con1 = db.getDb()
    expect(con1).toBe(con0)

    const con2 = db.getDb()
    expect(con2).toBe(con0)
    expect(mockConnect).toBeCalledTimes(1)
  })

  it("getDb: Throws on no connection", () => {
    expect.assertions(1)

    const mockConnect = vi.fn().mockReturnValueOnce(null)

    const db = new DatabaseProvider()
    db.connect = mockConnect

    expect(() => db.getDb()).toThrow(/Unable to connect to database/)
  })
})

export function serializeJsonWithBigInt(value: any): string {
  return JSON.stringify(value, (_, value) => (typeof value === "bigint" ? value.toString() : value))
}

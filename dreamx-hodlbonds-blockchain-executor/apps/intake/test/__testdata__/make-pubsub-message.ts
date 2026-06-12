import { regularMessage } from "./intake-data"

export function makeJsonStringDataMessage() {
  const msg = JSON.parse(JSON.stringify(regularMessage))
  msg.data = JSON.stringify(msg.data)
  return { json: msg }
}

export function makeNonJsonStringDataMessage() {
  const msg = JSON.parse(JSON.stringify(regularMessage))
  msg.data = "not a json"
  return { json: msg }
}

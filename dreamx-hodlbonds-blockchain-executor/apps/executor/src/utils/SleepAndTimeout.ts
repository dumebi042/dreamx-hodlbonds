export const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
export const timeout = (ms: number, msg = "Timeout") =>
  new Promise((_, reject) => {
    setTimeout(() => reject(msg), ms)
  })

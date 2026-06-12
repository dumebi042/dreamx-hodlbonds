export enum Executor {
  DcaBot = "DcaBot",
  DcaBotFixed = "DcaBotFixed",
  HodlBondsTrade = "HodlBondsTrade",
  UnitTest = "UnitTest",
}

export enum Network {
  eth = "eth",
  ava = "ava",
  met = "met", // For old-style gas settings
  tst = "tst",
}

export enum Status {
  ERROR_RETRY = "ERROR_RETRY",
  ERROR_NO_RETRY = "ERROR_NO_RETRY",
  EXCEPTION = "EXCEPTION",
  EXECUTED = "EXECUTED",
  EXECUTING = "EXECUTING",
  QUEUED = "QUEUED",
}

export type Data = Record<string, unknown>

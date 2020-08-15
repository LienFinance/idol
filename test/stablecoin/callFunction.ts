import {
  StableCoinInstance,
  TestStableCoinInstance,
} from "../../types/truffle-contracts";

export const LogIsAcceptableSBT = "LogIsAcceptableSBT";
export const LogMintIDOL = "LogMintIDOL";

export interface LogIsAcceptableSBTType extends Truffle.TransactionLog {
  event: typeof LogIsAcceptableSBT;
  args: {
    bondID: string;
    isAcceptable: boolean;
  };
}

export interface LogMintIDOLType extends Truffle.TransactionLog {
  event: typeof LogMintIDOL;
  args: {
    bondID: string;
    minter: string;
    poolID: string;
    obtainIDOLAmount: string;
    poolIDOLAmount: string;
  };
}

function isLogIsAcceptableSBTType(
  log: Truffle.TransactionLog
): log is LogIsAcceptableSBTType {
  return log.event === LogIsAcceptableSBT;
}

function isLogMintIDOLType(
  log: Truffle.TransactionLog
): log is LogMintIDOLType {
  return log.event === LogMintIDOL;
}

export async function callIsAcceptableSBT(
  IDOLContract: TestStableCoinInstance,
  ...params: Parameters<TestStableCoinInstance["isAcceptableSBT"]>
) {
  const res = await IDOLContract.isAcceptableSBT(...params);
  for (let i = 0; i < res.logs.length; i++) {
    const log = res.logs[i];
    if (isLogIsAcceptableSBTType(log)) {
      return log.args;
    }
  }

  throw new Error("event log of isAcceptableSBT was not found");
}

export async function callMintIDOL(
  IDOLContract: StableCoinInstance | TestStableCoinInstance,
  ...params: Parameters<typeof IDOLContract["mint"]>
) {
  const res = await IDOLContract.mint(...params);
  for (let i = 0; i < res.logs.length; i++) {
    const log = res.logs[i];
    if (isLogMintIDOLType(log)) {
      return log.args;
    }
  }

  throw new Error("event log of LogMintIDOL was not found");
}

import {BigNumber} from "bignumber.js";

import {BondTokenInstance} from "../../types/truffle-contracts";
import {toBTAmount, toEtherAmount} from "../util";

export const LogTransferETH = "LogTransferETH";

export interface LogTransferETHType extends Truffle.TransactionLog {
  event: typeof LogTransferETH;
  args: {
    from: string;
    to: string;
    value: BigNumber;
  };
}

function isLogWithdrawType(log: any): log is LogTransferETHType {
  return log.event === LogTransferETH;
}

export async function callBurn(
  bondTokenContract: BondTokenInstance,
  ...params: Parameters<typeof bondTokenContract.burn>
) {
  const res = await bondTokenContract.burn(...params);
  for (let i = 0; i < res.logs.length; i++) {
    const log = res.logs[i];
    if (isLogWithdrawType(log)) {
      const {value} = log.args;
      return {value: toEtherAmount(value)};
    }
  }

  return {value: new BigNumber(0)};
}

export async function callBalanceOf(
  bondTokenContract: BondTokenInstance,
  ...params: Parameters<typeof bondTokenContract.balanceOf>
) {
  const balance = await bondTokenContract.balanceOf(...params);
  return toBTAmount(balance);
}

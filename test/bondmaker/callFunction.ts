import {BigNumber} from "bignumber.js";

import {nullAddress} from "../util";
import {
  TestBondMakerInstance,
  BondMakerInstance,
} from "../../types/truffle-contracts";

export const LogNewBond = "LogNewBond";
export const LogNewBondGroup = "LogNewBondGroup";

export interface LogNewBondType extends Truffle.TransactionLog {
  event: typeof LogNewBond;
  args: {
    bondID: string;
    bondTokenAddress: string;
    stableStrikePrice: BigNumber;
    fnMapID: string;
  };
}
export interface LogNewBondGroupType extends Truffle.TransactionLog {
  event: typeof LogNewBondGroup;
  args: {
    bondGroupID: string;
  };
}

function isLogRegisterNewBondType(log: any): log is LogNewBondType {
  return log.event === LogNewBond;
}

function isLogNewBondGroupType(log: any): log is LogNewBondGroupType {
  return log.event === LogNewBondGroup;
}

export async function callGetBond(
  bondMakerContract: BondMakerInstance | TestBondMakerInstance,
  ...params: Parameters<typeof bondMakerContract["getBond"]>
) {
  const ten = new BigNumber(10);
  const decimal = 4;
  const res = await bondMakerContract.getBond(...params);
  return {
    bondTokenAddress: res[0],
    maturity: Number(res[1].toString()),
    solidStrikePrice: ten.pow(-decimal).times(res[2].toString()),
    fnMap: res[3],
  };
}

export async function callRegisterNewBondGroup(
  bondMakerContract: BondMakerInstance | TestBondMakerInstance,
  ...params: Parameters<typeof bondMakerContract["registerNewBondGroup"]>
) {
  const res = await bondMakerContract.registerNewBondGroup(...params);
  for (let i = 0; i < res.logs.length; i++) {
    const log = res.logs[i];
    if (isLogNewBondGroupType(log)) {
      return {
        bondGroupID: log.args.bondGroupID,
      };
    }
  }

  throw new Error("event log of registerNewBondGroup was not found");
}

/**
 * register new bond
 * @param bondMakerContract BondMaker contract
 * @param params the parameters of registerNewBond
 */
export async function callRegisterNewBond(
  bondMakerContract: BondMakerInstance | TestBondMakerInstance,
  ...params: Parameters<typeof bondMakerContract["registerNewBond"]>
) {
  const bondID = await bondMakerContract.generateBondID(...params);
  const {bondTokenAddress} = await callGetBond(bondMakerContract, bondID);
  if (bondTokenAddress !== nullAddress) {
    return {bondID, bondTokenAddress};
  }

  const res = await bondMakerContract.registerNewBond(...params);
  // console.log(`the used gas of registerNewBond: `, res.receipt.gasUsed);
  for (let i = 0; i < res.logs.length; i++) {
    const log = res.logs[i];
    if (isLogRegisterNewBondType(log)) {
      return log.args;
    }
  }

  throw new Error("event log of registerNewBond was not found");
}

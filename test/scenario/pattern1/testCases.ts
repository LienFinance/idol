import {BigNumber} from "bignumber.js";

import {days} from "../../util";
import {
  fnMapSolid1,
  fnMapLiquid1,
  fnMapSolid2,
  fnMapLiquid2,
  fnMapImmortal1,
  fnMapImmortal2,
  fnMapImmortal3,
} from "../../testCases";

const pat1case0 = {
  errorMessage: "",
  bonds: [
    {
      fnMap: fnMapSolid1,
      price: new BigNumber("0.2250e+18").shiftedBy(-18),
    },
    {
      fnMap: fnMapLiquid1,
      price: new BigNumber("0.5000e+18").shiftedBy(-18),
    },
  ],
  issuingBondAmount: new BigNumber("1.0e+8").shiftedBy(-8),
  lockingSBTAmount: new BigNumber("1.0e+8").shiftedBy(-8),
  unlockingIDOLAmount: new BigNumber("45e+8").shiftedBy(-8),
  periodSecBeforeLock: 0,
  periodSecBeforeUnlock: 0,
  periodSecBeforeMaturity: 15 * days,
  periodSecBeforeLiquidation: 16 * days,
  rateETH2USD: 200, // 200 USD/ETH
  volatility: 0,
  oracleHintId: ">latestId",
};
const pat1case1 = {
  success: false,
  errorMessage:
    "Returned error: VM Exception while processing transaction: revert the bond has not expired yet -- Reason given: the bond has not expired yet.",
  bonds: [
    {
      fnMap: fnMapSolid2,
      price: new BigNumber("0").shiftedBy(-8),
    },
    {
      fnMap: fnMapLiquid2,
      price: new BigNumber("0").shiftedBy(-8),
    },
  ],
  issuingBondAmount: new BigNumber("1.0e+8").shiftedBy(-8),
  lockingSBTAmount: new BigNumber("0").shiftedBy(-8),
  unlockingIDOLAmount: new BigNumber("0").shiftedBy(-8),
  periodSecBeforeLock: 0,
  periodSecBeforeUnlock: 0,
  periodSecBeforeMaturity: 2 * days,
  periodSecBeforeLiquidation: 1 * days,
  rateETH2USD: 200,
  volatility: 0,
  oracleHintId: 0,
};
const pat1case2 = {
  errorMessage: "",
  bonds: [
    {
      fnMap: fnMapSolid2,
      price: new BigNumber("0.6000e+8").shiftedBy(-8),
    },
    {
      fnMap: fnMapLiquid2,
      price: new BigNumber("0.4000e+8").shiftedBy(-8),
    },
  ],
  issuingBondAmount: new BigNumber("1.0e+8").shiftedBy(-8),
  lockingSBTAmount: new BigNumber("0").shiftedBy(-8),
  unlockingIDOLAmount: new BigNumber("0").shiftedBy(-8),
  periodSecBeforeLock: 0 * days,
  periodSecBeforeUnlock: 0 * days,
  periodSecBeforeMaturity: 2 * days,
  periodSecBeforeLiquidation: 3 * days,
  rateETH2USD: 200,
  volatility: 0,
  oracleHintId: 0,
};
const pat1case3 = {
  errorMessage: "",
  bonds: [
    {
      fnMap: fnMapSolid2,
      price: new BigNumber("0.6000e+8").shiftedBy(-8),
    },
    {
      fnMap: fnMapImmortal1,
      price: new BigNumber("0").shiftedBy(-8),
    },
    {
      fnMap: fnMapImmortal2,
      price: new BigNumber("0.2000e+8").shiftedBy(-8),
    },
    {
      fnMap: fnMapImmortal3,
      price: new BigNumber("0.2000e+8").shiftedBy(-8),
    },
  ],
  issuingBondAmount: new BigNumber("1.0e+8").shiftedBy(-8),
  lockingSBTAmount: new BigNumber("0").shiftedBy(-8),
  unlockingIDOLAmount: new BigNumber("0").shiftedBy(-8),
  periodSecBeforeLock: 0,
  periodSecBeforeUnlock: 0,
  periodSecBeforeMaturity: 2 * days,
  periodSecBeforeLiquidation: 3 * days,
  rateETH2USD: 200,
  volatility: 0,
  oracleHintId: 0,
};

export const pat1cases = [pat1case0, pat1case1, pat1case2, pat1case3];

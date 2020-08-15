import {BigNumber} from "bignumber.js";

import {days} from "../../util";
import {
  fnMapSolid2,
  fnMapLiquid2,
  fnMapImmortal1,
  fnMapImmortal2,
  fnMapImmortal3,
} from "../../testCases";

type EtherStatus = {
  advancedTime: number;
  rateETH2USD: BigNumber.Value; // unit: USD/ETH, dp: 8
  volatility: BigNumber.Value; // unit: 1, dp: 8
};

type Schedules =
  | {type: "advanceTime"; data: EtherStatus}
  | {
      type: "liquidateBond";
      data: {bondGroupIndex: number; redeemedEtherAmount: BigNumber.Value[]};
    };
type Pattern2TestCase = {
  errorMessage: string;
  etherStatus: {
    beforeRegisteringBonds: EtherStatus & {advancedTime: 0};
  };
  bondGroups: {
    periodSecBeforeMaturity: number;
    bonds: {
      fnMap: string;
      price: BigNumber.Value;
    }[];
    issuingBondAmount: BigNumber.Value;
    lockingSBTAmount: BigNumber.Value;
    unlockingIDOLAmount: BigNumber.Value;
  }[];
  liquidationSchedules: Schedules[];
};

const pat2case0: Pattern2TestCase = {
  errorMessage: "",
  etherStatus: {
    beforeRegisteringBonds: {
      advancedTime: 0,
      rateETH2USD: 200,
      volatility: 0,
    },
  },
  bondGroups: [
    {
      periodSecBeforeMaturity: 15 * days,
      bonds: [
        {
          fnMap: fnMapSolid2,
          price: 0.6,
        },
        {
          fnMap: fnMapLiquid2,
          price: 0.4,
        },
      ],
      issuingBondAmount: 1.0,
      lockingSBTAmount: 0,
      unlockingIDOLAmount: 0,
    },
    {
      periodSecBeforeMaturity: 15 * days,
      bonds: [
        {
          fnMap: fnMapSolid2,
          price: 0.6,
        },
        {
          fnMap: fnMapImmortal1,
          price: 0,
        },
        {
          fnMap: fnMapImmortal2,
          price: 0.2,
        },
        {
          fnMap: fnMapImmortal3,
          price: 0.2,
        },
      ],
      issuingBondAmount: 1.0,
      lockingSBTAmount: 0,
      unlockingIDOLAmount: 0,
    },
  ],
  liquidationSchedules: [
    {
      type: "advanceTime",
      data: {advancedTime: 16 * days, rateETH2USD: 200, volatility: 0},
    },
    {
      type: "liquidateBond",
      data: {bondGroupIndex: 0, redeemedEtherAmount: [1.2, 0.4]},
    },
    {
      type: "liquidateBond",
      data: {bondGroupIndex: 1, redeemedEtherAmount: [0, 0, 0.2, 0.2]},
    },
  ],
};

export const pat2cases = [pat2case0];

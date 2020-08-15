import BigNumber from "bignumber.js";
import Table = require("cli-table");
import {discretizeBidPrice} from "./generateRandomCase";

export const NO_LOWEST_LOSE_BID_PRICE = "NO_LOWEST_LOSE_BID_PRICE";

/**
 * @param invalidMyLowestPrice is true if myWinBids and myLoseBids is valid and myLowestPrice is invalid.
 */
type AuctionResult = {
  invalidMyLowestPrice?: boolean;
  myLowestPrice: BigNumber.Value | typeof NO_LOWEST_LOSE_BID_PRICE; // unit: iDOL/BT, dp: 8
  myLoseBids: {
    boardIndex: number;
    price: BigNumber.Value; // unit: iDOL/BT, dp: 8
  }[];
  myWinBids: {
    boardIndex: number;
    price: BigNumber.Value; // unit: iDOL/BT, dp: 8
  }[];
};

type AuctionInfo = {
  priceType?: "iDOL" | "USD";
  bids: {
    accountIndex: number;
    price: BigNumber.Value;
    amount: BigNumber.Value;
    random?: BigNumber.Value;
    early?: boolean;
    unrevealed?: boolean;
  }[];
  actions: {
    [accountIndex: string]: {
      result: null | AuctionResult;
    };
  };
};

interface AuctionInfoIDOL extends AuctionInfo {
  priceType: "iDOL";
}

/**
 * @param etherStatus can simulate the ETH rate when executing a certain action.
 */
type Pattern3BondGroup = {
  solidStrikePrice: BigNumber.Value; // unit: USD/BT, dp: 4
  assets: {
    [accountIndex: string]: {
      mintingBondAmount: BigNumber.Value; // unit: BT, dp: 8
      lockingSBTAmount: BigNumber.Value; // unit: BT, dp: 8
      burningIDOLValue?: BigNumber.Value; // unit: USD, dp: 12
    };
  };
  etherStatus?: {
    beforeRegisteringBonds?: {
      untilMaturity: number; // unit: sec, dp: 0
      rateETH2USD: BigNumber.Value; // unit: USD/ETH, dp: 8
      volatility: BigNumber.Value; // unit: 1, dp: 8
    };
    beforeStartingAuction?: {
      untilMaturity: number; // unit: sec, dp: 0
      rateETH2USD: BigNumber.Value; // unit: USD/ETH, dp: 8
      volatility: BigNumber.Value; // unit: 1, dp: 8
    };
  };
  auctions: AuctionInfo[];
};

/**
 * @param errorMessage is the error message encountered at first. It is the empty string if no error occurs.
 * @param users is the indices of accounts whose balance of iDOL and SBT track.
 */
export type Pattern3TestCase = {
  abstraction?: string;
  errorMessage: string;
  users: number[];
  bondGroups: Pattern3BondGroup[];
};

export function convertToAuctionInfoIDOL(
  auctionInfo: AuctionInfo,
  lambda: BigNumber.Value = 1
): AuctionInfoIDOL {
  const {bids, actions} = auctionInfo;
  return {
    priceType: "iDOL",
    bids: bids.map(
      ({accountIndex, price, amount, random, early, unrevealed}) => ({
        accountIndex,
        amount,
        random,
        early,
        unrevealed,
        price: discretizeBidPrice(new BigNumber(price).times(lambda)),
      })
    ),
    actions: Object.entries(actions).reduce((acc, [accountIndex, {result}]) => {
      if (result === null) {
        acc[accountIndex] = {result: null};
      } else {
        const {
          invalidMyLowestPrice,
          myLowestPrice,
          myLoseBids,
          myWinBids,
        } = result;
        acc[accountIndex] = {
          result: {
            invalidMyLowestPrice,
            myLowestPrice:
              myLowestPrice === NO_LOWEST_LOSE_BID_PRICE
                ? NO_LOWEST_LOSE_BID_PRICE
                : discretizeBidPrice(
                    new BigNumber(myLowestPrice).times(lambda)
                  ),
            myLoseBids: myLoseBids.map(({boardIndex, price}) => ({
              boardIndex,
              price: discretizeBidPrice(new BigNumber(price).times(lambda)),
            })),
            myWinBids: myWinBids.map(({boardIndex, price}) => ({
              boardIndex,
              price: discretizeBidPrice(new BigNumber(price).times(lambda)),
            })),
          },
        };
      }
      return acc;
    }, {} as AuctionInfo["actions"]),
  };
}

export function getOngoingSBT3(
  bondGroupInfo: Pattern3TestCase["bondGroups"][number]
) {
  let result = new BigNumber(0);
  for (const user in bondGroupInfo.assets) {
    result = result.plus(
      new BigNumber(bondGroupInfo.assets[user].lockingSBTAmount)
    );
  }
  return result;
}

export function isLast3(p: Pattern3TestCase, bondGroupIndex: number): boolean {
  const bondGroup = p.bondGroups[bondGroupIndex];
  const ongoing = getOngoingSBT3(bondGroup);
  if (ongoing.eq(0)) {
    // Cannot start the auction for the SBT.
    return false;
  }

  let bidSBTTotal = new BigNumber(0);
  for (const auctionInfo of bondGroup.auctions) {
    for (const bid of auctionInfo.bids) {
      bidSBTTotal = bidSBTTotal.plus(bid.amount);
    }
  }

  // If The bid total is less than the auctioned amount, the auction will be restarted.
  return bidSBTTotal.gte(ongoing);
}

export function viewer({bondGroups, users}: Pattern3TestCase) {
  const totalLockingSBTValueColumn = Array.from(
    {length: Math.max(...users) + 1},
    () => 0
  );
  const totalLockingSBTValueRow = Array.from(
    {length: bondGroups.length},
    () => 0
  );
  const paidIdolAmountMatrix = new Array<number[]>();
  for (const [
    bondGroupIndex,
    {solidStrikePrice, assets, auctions},
  ] of bondGroups.entries()) {
    let paidIdolAmountList = Array.from(
      {length: Math.max(...users) + 1},
      () => 0
    );
    for (const {bids} of auctions) {
      for (const {accountIndex, amount} of bids) {
        paidIdolAmountList[accountIndex] =
          (paidIdolAmountList[accountIndex] || 0) +
          new BigNumber(amount).toNumber();
      }
    }
    paidIdolAmountMatrix[bondGroupIndex] = paidIdolAmountList;

    for (const [accountIndex, {lockingSBTAmount: amount}] of Object.entries(
      assets
    )) {
      totalLockingSBTValueColumn[accountIndex] =
        (totalLockingSBTValueColumn[accountIndex] || 0) +
        new BigNumber(amount).toNumber() *
          new BigNumber(solidStrikePrice).toNumber() *
          0.9;

      totalLockingSBTValueRow[bondGroupIndex] =
        (totalLockingSBTValueRow[bondGroupIndex] || 0) +
        new BigNumber(amount).toNumber();
    }
  }

  const table = new Table({
    head: [
      "bid amount",
      ...Array.from({length: Math.max(...users) + 1}, (_, i) => `User ${i}`),
      "locked SBT",
      "strike price",
    ],
  });

  table.push(
    ...paidIdolAmountMatrix.map((v, i) => ({
      [`Bond Group ${i}`]: [
        ...v,
        totalLockingSBTValueRow[i],
        Number(bondGroups[i].solidStrikePrice),
      ],
    })),
    {"iDOL balance": [...totalLockingSBTValueColumn, "", ""]}
  );

  console.log(table.toString());
}

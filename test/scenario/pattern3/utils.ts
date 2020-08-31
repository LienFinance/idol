import BigNumber from "bignumber.js";
import Table = require("cli-table");
import {discretizeBidPrice} from "./generateRandomCase";

export const NO_LOWEST_LOSE_BID_PRICE = "NO_LOWEST_LOSE_BID_PRICE";
export const GIVE_UP_TO_MAKE_AUCTION_RESULT = "GIVE_UP_TO_MAKE_AUCTION_RESULT";
export const UPPER_BID_PRICE_LIMIT = "UPPER_BID_PRICE_LIMIT";

/**
 * @param invalidMyLowestPrice is true if myWinBids and myLoseBids is valid and myLowestPrice is invalid.
 */
type AuctionResult = {
  invalidMyLowestPrice?: boolean;
  myLowestPrice:
    | BigNumber.Value
    | typeof NO_LOWEST_LOSE_BID_PRICE
    | typeof GIVE_UP_TO_MAKE_AUCTION_RESULT
    | typeof UPPER_BID_PRICE_LIMIT; // unit: iDOL/BT, dp: 8
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
    bidInfoList?: {
      price: BigNumber.Value;
      amount: BigNumber.Value;
    }[];
    price?: BigNumber.Value;
    amount: BigNumber.Value;
    random?: BigNumber.Value;
    early?: boolean;
    unrevealed?: boolean;
    isDelegated?: boolean;
  }[];
  actions: {
    [accountIndex: string]: {
      isMakingAuctionResultLately?: boolean;
      result: null | AuctionResult;
    };
  };
  giveUpSortBidPrice?: boolean;
  giveUpMakeEndInfo?: boolean;
  isReceivingWinBidsLately?: boolean;
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
      untilMaturity?: number; // unit: sec, dp: 0
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

export function splitBids(bids: AuctionInfo["bids"]) {
  const splitBids = new Array<{
    accountIndex: number;
    price: BigNumber.Value;
    amount: BigNumber.Value;
    random?: BigNumber.Value;
    early?: boolean;
    unrevealed?: boolean;
  }>();
  for (const bid of bids) {
    const {price, amount, bidInfoList, ...rest} = bid;
    if (price !== undefined) {
      splitBids.push({
        price: new BigNumber(price),
        amount: new BigNumber(amount),
        ...rest,
      });
    } else if (bidInfoList !== undefined) {
      const unrevealable = !bidInfoList
        .reduce((acc, {amount}) => acc.plus(amount), new BigNumber(0))
        .eq(amount);
      if (unrevealable) {
        splitBids.push({
          price: bidInfoList[0].price,
          amount,
          ...rest,
          unrevealed: true,
        });
      } else {
        for (const {price, amount} of bidInfoList) {
          splitBids.push({price, amount, ...rest});
        }
      }
    } else {
      throw new Error("the bids format is invalid");
    }
  }
  return splitBids;
}

export function getBidPriceLimit(
  strikePriceIDOL: BigNumber.Value,
  auctionRestartedCount: number
) {
  const upperBidPriceLimit = discretizeBidPrice(
    new BigNumber(strikePriceIDOL).dp(0, BigNumber.ROUND_UP)
  );

  const auctionCount = Math.min(auctionRestartedCount + 1, 9);
  const lowerBidPriceLimit = discretizeBidPrice(
    new BigNumber(strikePriceIDOL)
      .times(10 - auctionCount)
      .shiftedBy(-1)
      .dp(0, BigNumber.ROUND_UP)
  );
  return {upperBidPriceLimit, lowerBidPriceLimit};
}

function getValidBidPrice(
  bidPriceE0: BigNumber.Value,
  upperBidPriceLimitE0: BigNumber.Value,
  lowerBidPriceLimitE0: BigNumber.Value
) {
  if (new BigNumber(bidPriceE0).gt(upperBidPriceLimitE0)) {
    bidPriceE0 = upperBidPriceLimitE0;
  } else if (new BigNumber(bidPriceE0).lt(lowerBidPriceLimitE0)) {
    bidPriceE0 = lowerBidPriceLimitE0;
  }
  return discretizeBidPrice(bidPriceE0);
}

export function convertToAuctionInfoIDOL(
  auctionInfo: AuctionInfo,
  upperBidPriceLimit: BigNumber.Value,
  lowerBidPriceLimit: BigNumber.Value,
  lambda: BigNumber.Value = 1
): AuctionInfoIDOL {
  const {bids, actions} = auctionInfo;
  const newBids = bids.map(
    ({accountIndex, bidInfoList, price, amount, random, early, unrevealed}) => {
      if (price !== undefined) {
        return {
          accountIndex,
          amount,
          random,
          early,
          unrevealed,
          price:
            price === UPPER_BID_PRICE_LIMIT
              ? new BigNumber(upperBidPriceLimit)
              : getValidBidPrice(
                  new BigNumber(price).times(lambda),
                  upperBidPriceLimit,
                  lowerBidPriceLimit
                ),
        };
      } else if (bidInfoList !== undefined) {
        return {
          accountIndex,
          random,
          early,
          unrevealed,
          amount,
          bidInfoList: bidInfoList.map(({amount, price}) => ({
            amount,
            price:
              price === UPPER_BID_PRICE_LIMIT
                ? new BigNumber(upperBidPriceLimit)
                : getValidBidPrice(
                    new BigNumber(price).times(lambda),
                    upperBidPriceLimit,
                    lowerBidPriceLimit
                  ),
          })),
        };
      }

      throw new Error("bids format is invalid");
    }
  );

  const newActions = Object.entries(actions).reduce(
    (acc, [accountIndex, {result}]) => {
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
              myLowestPrice === GIVE_UP_TO_MAKE_AUCTION_RESULT
                ? GIVE_UP_TO_MAKE_AUCTION_RESULT
                : myLowestPrice === NO_LOWEST_LOSE_BID_PRICE
                ? NO_LOWEST_LOSE_BID_PRICE
                : myLowestPrice === UPPER_BID_PRICE_LIMIT
                ? new BigNumber(upperBidPriceLimit)
                : getValidBidPrice(
                    new BigNumber(myLowestPrice).times(lambda),
                    upperBidPriceLimit,
                    lowerBidPriceLimit
                  ),
            myLoseBids: myLoseBids.map(({boardIndex, price}) => ({
              boardIndex,
              price:
                price === UPPER_BID_PRICE_LIMIT
                  ? new BigNumber(upperBidPriceLimit)
                  : getValidBidPrice(
                      new BigNumber(price).times(lambda),
                      upperBidPriceLimit,
                      lowerBidPriceLimit
                    ),
            })),
            myWinBids: myWinBids.map(({boardIndex, price}) => ({
              boardIndex,
              price:
                price === UPPER_BID_PRICE_LIMIT
                  ? new BigNumber(upperBidPriceLimit)
                  : getValidBidPrice(
                      new BigNumber(price).times(lambda),
                      upperBidPriceLimit,
                      lowerBidPriceLimit
                    ),
            })),
          },
        };
      }
      return acc;
    },
    {} as AuctionInfo["actions"]
  );

  return {
    priceType: "iDOL" as "iDOL",
    bids: newBids,
    actions: newActions,
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

// import * as fs from 'fs';
import {BigNumber} from "bignumber.js";
import {
  NO_LOWEST_LOSE_BID_PRICE,
  Pattern3TestCase,
  getBidPriceLimit,
} from "./utils";
import {isDangerSolidBond} from "./theory/solidBondSafety";
import Pattern3LambdaSimulator from "./theory/lambdaSimulator";

const LOCK_POOL_BORDER = 0.1; // the beta value

BigNumber.set({ROUNDING_MODE: BigNumber.ROUND_DOWN});

type Board = {
  [price: string]: {
    bidder: number;
    amount: BigNumber.Value;
  }[];
};

// Both of the maximum and the minimum is inclusive.
export function getRandomInt(min: number = 0, max: number = 0): number {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function getRandomValueFromList<T>(args: T[]) {
  const index = getRandomInt(0, args.length - 1);
  return args[index];
}

export function getAuctionSBTAmount(assets: {
  [accountIndex: string]: {lockingSBTAmount: BigNumber.Value};
}) {
  let auctionSBTAmount = new BigNumber(0);
  for (const {lockingSBTAmount} of Object.values(assets)) {
    auctionSBTAmount = auctionSBTAmount.plus(new BigNumber(lockingSBTAmount));
  }
  return auctionSBTAmount;
}

export function discretizeBidPrice(
  priceE0: BigNumber.Value,
  roundingMode: 0 | 4 | 1 | 2 | 3 | 5 | 6 | 7 | 8 = BigNumber.ROUND_DOWN
) {
  const priceE8 = new BigNumber(priceE0).shiftedBy(8);

  const decimalPlaces = priceE8.lt(5 * 10 ** 8)
    ? -5
    : priceE8.lt(5 * 10 ** 9)
    ? -6
    : priceE8.lt(5 * 10 ** 10)
    ? -7
    : priceE8.lt(5 * 10 ** 11)
    ? -8
    : priceE8.lt(5 * 10 ** 12)
    ? -9
    : priceE8.lt(5 * 10 ** 13)
    ? -10
    : priceE8.lt(5 * 10 ** 14)
    ? -11
    : -12;

  const discretizedPriceE8 = priceE8
    .shiftedBy(decimalPlaces)
    .dp(0, roundingMode)
    .shiftedBy(-decimalPlaces);
  return discretizedPriceE8.shiftedBy(-8).toNumber();
}

export function stepOfBidPrice(maxPriceE0: BigNumber.Value) {
  const priceE8 = new BigNumber(maxPriceE0).shiftedBy(8);

  const decimalPlaces = priceE8.lt(5 * 10 ** 8)
    ? -4
    : priceE8.lt(5 * 10 ** 9)
    ? -5
    : priceE8.lt(5 * 10 ** 10)
    ? -6
    : priceE8.lt(5 * 10 ** 11)
    ? -7
    : priceE8.lt(5 * 10 ** 12)
    ? -8
    : priceE8.lt(5 * 10 ** 13)
    ? -9
    : priceE8.lt(5 * 10 ** 14)
    ? -10
    : -11;

  const step = new BigNumber(1).shiftedBy(-8 - decimalPlaces);
  return step;
}

// need to discretize bid price.
export function getBoard(
  strikePriceIDOL: BigNumber.Value,
  bids: {
    accountIndex: number;
    price: BigNumber.Value;
    amount: BigNumber.Value;
    early?: boolean;
    unrevealed?: boolean;
  }[]
) {
  const {upperBidPriceLimit} = getBidPriceLimit(strikePriceIDOL, 0);

  // Align the bids according to revealed time.
  bids = [
    ...bids.filter((bidInfo) => bidInfo.early === true),
    ...bids.filter((bidInfo) => bidInfo.early !== true),
  ];
  let board: Board = {};
  let totalUnrevealedAmount = new BigNumber(0);
  let totalIDOLRevealed = new BigNumber(0);
  let totalIDOLSecret = new BigNumber(0);
  for (const {amount, price, accountIndex, early, unrevealed} of bids) {
    const bidPrice = early
      ? discretizeBidPrice(upperBidPriceLimit)
      : discretizeBidPrice(price);
    const bidAmount = new BigNumber(amount).dp(8);
    const depositingIDOL = bidAmount
      .times(upperBidPriceLimit)
      .dp(8, BigNumber.ROUND_UP);
    totalIDOLSecret = totalIDOLSecret.plus(depositingIDOL);
    if (unrevealed) {
      totalUnrevealedAmount = totalUnrevealedAmount.plus(bidAmount);
      continue;
    }

    if (board[bidPrice.toString(10)] === undefined) {
      board[bidPrice.toString(10)] = [];
    }

    board[bidPrice.toString(10)].push({
      amount: bidAmount,
      bidder: accountIndex,
    });
    totalIDOLRevealed = totalIDOLRevealed.plus(depositingIDOL);
  }

  const IDOLAmountUnrevealedBid = totalIDOLSecret.minus(totalIDOLRevealed);
  const settledAmountForUnrevealed = IDOLAmountUnrevealedBid.div(
    strikePriceIDOL
  ).dp(8);

  // secret bids which has not revealed, strikePriceIDOL calculated by lambda at the time executing _disposeOfUnrevealedBid().
  return {
    board,
    totalUnrevealedAmount,
    settledAmountForUnrevealed,
  };
}

export function sortPriceFromBoard(board: Board) {
  return Object.keys(board).sort((a: string, b: string) =>
    new BigNumber(b).comparedTo(a)
  );
}

export function getEndInfo(auctionSBTAmount: BigNumber.Value, board: Board) {
  let restAuctionSBTAmount = new BigNumber(auctionSBTAmount);
  if (restAuctionSBTAmount.lte(0)) {
    restAuctionSBTAmount = new BigNumber(0);
  }
  let winnerSBTAmountAtEndPrice = new BigNumber(0);
  const sortedPriceList = sortPriceFromBoard(board);
  const maxPriceIndex = sortedPriceList.length - 1;
  let maxBoardIndex = 0;
  for (let priceIndex = 0; priceIndex <= maxPriceIndex; priceIndex++) {
    const price = sortedPriceList[priceIndex];
    maxBoardIndex = board[price].length - 1;
    winnerSBTAmountAtEndPrice = new BigNumber(0);
    for (let boardIndex = 0; boardIndex <= maxBoardIndex; boardIndex++) {
      const bid = board[price][boardIndex];
      const bidAmount = new BigNumber(bid.amount);
      if (restAuctionSBTAmount.lte(bidAmount)) {
        winnerSBTAmountAtEndPrice = winnerSBTAmountAtEndPrice.plus(
          restAuctionSBTAmount
        );
        const loseSBTAmount = bidAmount.minus(restAuctionSBTAmount);
        return {
          priceIndex,
          boardIndex,
          loseSBTAmount,
          winnerSBTAmountAtEndPrice,
        };
      }

      winnerSBTAmountAtEndPrice = winnerSBTAmountAtEndPrice.plus(bidAmount);
      restAuctionSBTAmount = restAuctionSBTAmount.minus(bidAmount);
    }
  }

  return {
    priceIndex: maxPriceIndex,
    boardIndex: maxBoardIndex,
    loseSBTAmount: new BigNumber(0),
    winnerSBTAmountAtEndPrice,
  };
}

export function getWinAmount(
  auctionSBTAmount: BigNumber.Value,
  board: Board,
  bidder: number
) {
  let winAmount = new BigNumber(0);
  let restAuctionSBTAmount = new BigNumber(auctionSBTAmount);
  if (restAuctionSBTAmount.lte(0)) {
    return new BigNumber(0);
  }
  for (const price of sortPriceFromBoard(board)) {
    for (let boardIndex = 0; boardIndex < board[price].length; boardIndex++) {
      const bid = board[price][boardIndex];
      const bidAmount = new BigNumber(bid.amount);
      if (restAuctionSBTAmount.lte(bidAmount)) {
        if (bidder === bid.bidder) {
          winAmount = winAmount.plus(restAuctionSBTAmount);
        }
        return winAmount;
      }

      if (bidder === bid.bidder) {
        winAmount = winAmount.plus(bidAmount);
      }
      restAuctionSBTAmount = restAuctionSBTAmount.minus(bidAmount);
    }
  }

  return winAmount;
}

export function getMyLowestPrice(
  auctionSBTAmount: BigNumber.Value,
  board: Board,
  endInfo: {
    priceIndex: number;
    boardIndex: number;
    loseSBTAmount: BigNumber.Value;
  },
  bidder: number
) {
  let myLowestPrice:
    | BigNumber
    | typeof NO_LOWEST_LOSE_BID_PRICE = NO_LOWEST_LOSE_BID_PRICE;

  let restWinnerAmount = getWinAmount(auctionSBTAmount, board, bidder);
  if (restWinnerAmount.lte(0)) {
    return myLowestPrice;
  }

  const endPriceIndex = endInfo.priceIndex;
  const endBoardIndex = endInfo.boardIndex;
  const loseSBTAmount = new BigNumber(endInfo.loseSBTAmount);

  const sortedPriceList = sortPriceFromBoard(board);
  for (
    let priceIndex = endPriceIndex;
    priceIndex < sortedPriceList.length;
    priceIndex++
  ) {
    const price = new BigNumber(sortedPriceList[priceIndex]);
    const bids = board[sortedPriceList[priceIndex]];
    const initBoardIndex = priceIndex == endPriceIndex ? endBoardIndex : 0;

    let totalLoseBidsAtPrice = new BigNumber(0);
    for (
      let boardIndex = initBoardIndex;
      boardIndex < bids.length;
      boardIndex++
    ) {
      let bidInfo = bids[boardIndex];
      const bidAmount =
        priceIndex == endPriceIndex && boardIndex == endBoardIndex
          ? loseSBTAmount
          : new BigNumber(bidInfo.amount);

      if (bidAmount.eq(0)) {
        // do not record myLowestPrice
        continue;
      }

      totalLoseBidsAtPrice = totalLoseBidsAtPrice.plus(bidAmount);

      if (bidder == bidInfo.bidder) {
        myLowestPrice = price;
        restWinnerAmount = restWinnerAmount.plus(bidAmount);
      }
    }

    if (restWinnerAmount.gt(totalLoseBidsAtPrice)) {
      restWinnerAmount = restWinnerAmount.minus(totalLoseBidsAtPrice);
    } else {
      restWinnerAmount = new BigNumber(0);
      break;
    }
  }

  return myLowestPrice;
}

export function getBidStatus(
  price: BigNumber.Value,
  boardIndex: number,
  endPrice: BigNumber.Value,
  endBoardIndex: number,
  loseSBTAmount: BigNumber.Value,
  winnerSBTAmountAtEndPrice: BigNumber.Value
) {
  let isWinBid = false; // win bids exist
  let isLoseBid = false; // lose bids exist
  if (new BigNumber(price).gt(endPrice)) {
    isWinBid = true;
  } else if (new BigNumber(price).eq(endPrice)) {
    if (boardIndex < endBoardIndex) {
      isWinBid = true;
    } else if (boardIndex === endBoardIndex) {
      if (
        new BigNumber(loseSBTAmount).eq(0) &&
        new BigNumber(winnerSBTAmountAtEndPrice).gt(0)
      ) {
        isWinBid = true;
      } else if (
        new BigNumber(loseSBTAmount).gt(0) &&
        new BigNumber(winnerSBTAmountAtEndPrice).gt(0)
      ) {
        isWinBid = true;
        isLoseBid = true;
      } else if (
        new BigNumber(loseSBTAmount).gt(0) &&
        new BigNumber(winnerSBTAmountAtEndPrice).eq(0)
      ) {
        isLoseBid = true;
      }
    } else {
      isLoseBid = true;
    }
  } else {
    isLoseBid = true;
  }

  return {isWinBid, isLoseBid};
}

export function calcSettledPrice(
  auctionSBTAmount: BigNumber.Value,
  lowestBidPrice: BigNumber.Value,
  board: Board,
  bidder: number
): {toPayIDOLAmount: BigNumber; rewardedSBTAmount: BigNumber} {
  const settledAmountInit = getWinAmount(auctionSBTAmount, board, bidder);
  if (settledAmountInit.lte(0)) {
    const toPayIDOLAmount = new BigNumber(0);
    const rewardedSBTAmount = new BigNumber(0);
    return {toPayIDOLAmount, rewardedSBTAmount};
  }

  const {
    priceIndex: endPriceIndex,
    boardIndex: endBoardIndex,
    loseSBTAmount,
  } = getEndInfo(auctionSBTAmount, board);

  let toPay = new BigNumber(0);
  let settledAmount = settledAmountInit;

  const auctionPriceList = sortPriceFromBoard(board);
  for (let i = endPriceIndex; i < auctionPriceList.length; i++) {
    const price = new BigNumber(auctionPriceList[i]);
    const bids = board[auctionPriceList[i]];

    let initJ = 0;
    if (i == endPriceIndex) {
      initJ = endBoardIndex;
    }

    for (let j = initJ; j < bids.length; j++) {
      let bidInfo = bids[j];

      if (bidder == bidInfo.bidder) {
        continue;
      }

      if (i == endPriceIndex && j == initJ) {
        if (settledAmount.gt(loseSBTAmount)) {
          toPay = toPay.plus(
            loseSBTAmount.times(price).dp(8, BigNumber.ROUND_UP)
          );
          settledAmount = settledAmount.minus(loseSBTAmount);
        } else {
          toPay = toPay.plus(
            settledAmount.times(price).dp(8, BigNumber.ROUND_UP)
          );
          settledAmount = new BigNumber(0);
          break;
        }
      } else if (settledAmount.gt(bidInfo.amount)) {
        toPay = toPay.plus(
          new BigNumber(bidInfo.amount).times(price).dp(8, BigNumber.ROUND_UP)
        );
        settledAmount = settledAmount.minus(bidInfo.amount);
      } else {
        toPay = toPay.plus(
          settledAmount.times(price).dp(8, BigNumber.ROUND_UP)
        );
        settledAmount = new BigNumber(0);
        break;
      }
    }

    if (settledAmount.eq(0)) {
      break;
    }
  }

  toPay = toPay.plus(
    settledAmount.times(lowestBidPrice).dp(8, BigNumber.ROUND_UP)
  );
  console.log(
    settledAmount.toString(10),
    lowestBidPrice,
    settledAmount.times(lowestBidPrice).dp(8, BigNumber.ROUND_UP).toString(10)
  );
  return {
    toPayIDOLAmount: toPay,
    rewardedSBTAmount: settledAmountInit,
  };
}

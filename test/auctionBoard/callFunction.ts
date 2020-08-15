import {BigNumber} from "bignumber.js";

import {
  AuctionBoardInstance,
  AuctionInstance,
} from "../../types/truffle-contracts";
import {days} from "../util";

const LogInsertBoard = "LogInsertBoard";

export interface LogInsertBoardType extends Truffle.TransactionLog {
  event: typeof LogInsertBoard;
  args: {
    /* bytes32 indexed */ auctionID: string;
    /* address indexed */ bidder: string;
    /* uint64 */ bidPrice: BN;
    /* uint64 */ boardIndex: BN;
    /* uint64 */ targetSBTAmount: BN;
  };
}

function isLogInsertBoardType(log: any): log is LogInsertBoardType {
  return log.event === LogInsertBoard;
}

export async function callRevealBids(
  auctionBoardContract: AuctionBoardInstance,
  ...params: Parameters<typeof auctionBoardContract.revealBids>
) {
  const res = await auctionBoardContract.revealBids(...params);
  for (const log of res.logs) {
    if (isLogInsertBoardType(log)) {
      return {
        bidPrice: log.args.bidPrice.toString(10),
        boardIndex: log.args.boardIndex.toNumber(),
      };
    }
  }

  throw new Error("event log of revealBid was not found");
}

export type AuctionStatus = {
  auctionID: string;
  closingTime: number;
  auctionAmount: BigNumber;
  rewardedAmount: BigNumber;
  totalSBTAmountBid: BigNumber;
  isEmergency: boolean;
  doneFinalizeWinnerAmount: boolean;
  doneSortPrice: boolean;
};

export async function callGetAuctionStatus(
  auctionInstance: AuctionInstance,
  listingTime: {from: number; to: number}
) {
  const res = new Array<AuctionStatus[]>();
  for (
    let weekNumber = Math.floor(listingTime.from / (7 * days));
    weekNumber <= Math.floor(listingTime.to / (7 * days));
    weekNumber++
  ) {
    const weeklyRes = new Array<AuctionStatus>();
    const weeklyAuctionStatus = await auctionInstance.getWeeklyAuctionStatus(
      weekNumber
    );
    for (let i = 0; i < Math.floor(weeklyAuctionStatus.length / 6); i++) {
      const {
        [i * 6]: closingTime,
        [i * 6 + 1]: auctionAmount,
        [i * 6 + 2]: rewardedAmount,
        [i * 6 + 3]: totalSBTAmountBid,
        [i * 6 + 4]: auctionStatusCode,
        [i * 6 + 5]: auctionID,
      } = weeklyAuctionStatus;

      weeklyRes.push({
        auctionID: "0x" + auctionID.toString(16),
        closingTime: parseInt(closingTime.toString()),
        auctionAmount: new BigNumber(auctionAmount.toString()),
        rewardedAmount: new BigNumber(rewardedAmount.toString()),
        totalSBTAmountBid: new BigNumber(totalSBTAmountBid.toString()),
        isEmergency: auctionStatusCode.toString(2).slice(-3, -2) === "1",
        doneFinalizeWinnerAmount:
          auctionStatusCode.toString(2).slice(-2, -1) === "1",
        doneSortPrice: auctionStatusCode.toString(2).slice(-1) === "1",
      });
    }

    res.push(weeklyRes);
  }

  return res;
}

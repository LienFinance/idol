import {
  AuctionInstance,
  AuctionBoardInstance,
} from "../../types/truffle-contracts";

const LogAuctionInfoDiff = "LogAuctionInfoDiff";
const LogAuctionResult = "LogAuctionResult";
const LogCloseAuction = "LogCloseAuction";

export interface LogAuctionInfoDiffType extends Truffle.TransactionLog {
  event: typeof LogAuctionInfoDiff;
  args: {
    /* bytes32 indexed */ auctionID: string;
    /* uint64 */ settledAmount: BN;
    /* uint64 */ paidIDOL: BN;
    /* uint64 */ rewardedSBT: BN;
  };
}

export interface LogAuctionResultType extends Truffle.TransactionLog {
  event: typeof LogAuctionResult;
  args: {
    /* bytes32 indexed */ auctionID: string;
    /* address indexed */ bidder: string;
    /* uint256 */ SBTAmountOfReward: BN;
    /* uint256 */ IDOLAmountOfPayment: BN;
    /* uint256 */ IDOLAmountOfChange: BN;
  };
}

export interface LogCloseAuctionType extends Truffle.TransactionLog {
  event: typeof LogCloseAuction;
  args: {
    /* bytes32 indexed */ auctionID: string;
    /* boolean */ isLast: boolean;
    /* bytes32 */ nextAuctionID: string;
  };
}

function isLogAuctionInfoDiffType(log: any): log is LogAuctionInfoDiffType {
  return log.event === LogAuctionInfoDiff;
}

function isLogAuctionResultType(log: any): log is LogAuctionResultType {
  return log.event === LogAuctionResult;
}

function isLogCloseAuctionType(log: any): log is LogCloseAuctionType {
  return log.event === LogCloseAuction;
}

export async function callMakeEndInfo(
  auctionBoardContract: AuctionBoardInstance,
  ...params: Parameters<typeof auctionBoardContract.makeEndInfo>
) {
  const res = await auctionBoardContract.makeEndInfo(...params);
  console.log("gasUsed:", res.receipt.gasUsed);
  for (let i = 0; i < res.logs.length; i++) {
    const log = res.logs[i];
    if (isLogAuctionInfoDiffType(log)) {
      const {settledAmount, paidIDOL, rewardedSBT} = log.args;
      return {settledAmount, paidIDOL, rewardedSBT};
    }
  }

  throw new Error("event `LogAuctionInfoDiff` was not found");
}

export async function callMakeAuctionResult(
  auctionContract: AuctionInstance,
  ...params: Parameters<typeof auctionContract.makeAuctionResult>
) {
  const res = await auctionContract.makeAuctionResult(...params);
  console.log("gasUsed:", res.receipt.gasUsed);
  for (let i = 0; i < res.logs.length; i++) {
    const log = res.logs[i];
    if (isLogAuctionResultType(log)) {
      const {
        SBTAmountOfReward,
        IDOLAmountOfPayment,
        IDOLAmountOfChange,
      } = log.args;
      return {SBTAmountOfReward, IDOLAmountOfPayment, IDOLAmountOfChange};
    }
  }

  throw new Error("event `LogAuctionResult` was not found");
}

export async function callCloseAuction(
  auctionContract: AuctionInstance,
  ...params: Parameters<typeof auctionContract.closeAuction>
) {
  const res = await auctionContract.closeAuction(...params);
  console.log("gasUsed:", res.receipt.gasUsed);
  for (const log of res.logs) {
    if (isLogCloseAuctionType(log)) {
      const {isLast, nextAuctionID} = log.args;
      return {isLast, nextAuctionID};
    }
  }

  throw new Error("event `LogCloseAuction` was not found");
}

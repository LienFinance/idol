import BigNumber from "bignumber.js";

const minutes = 60;
const hours = 60 * minutes;
const maxUint64 = new BigNumber(2).pow(64).minus(1);

require("dotenv").config();

const {VERSION} = process.env;
const auctionSpanConfigStaging = {
  auctionSpan: 45 * minutes,
  emergencyAuctionSpan: 45 * minutes,
  minNormalAuctionPeriod: 15 * minutes,
  minEmergencyAuctionPeriod: 15 * minutes,
  normalAuctionRevealSpan: 15 * minutes,
  emergencyAuctionRevealSpan: 15 * minutes,
  auctionWithdrawSpan: 15 * minutes,
  emergencyAuctionWithdrawSpan: 15 * minutes,
};
const auctionSpanConfigProduction = {
  auctionSpan: 72 * hours,
  emergencyAuctionSpan: 25 * hours,
  minNormalAuctionPeriod: 24 * hours,
  minEmergencyAuctionPeriod: 1 * hours,
  normalAuctionRevealSpan: 12 * hours,
  emergencyAuctionRevealSpan: 1 * hours,
  auctionWithdrawSpan: 24 * hours,
  emergencyAuctionWithdrawSpan: 1 * hours,
};
const auctionBoardConfig = {
  maxPriceIndex: 999,
  maxBoardIndex: maxUint64.toString(10),
  maxBoardIndexAtEndPrice: 999,
  maxBidCountPerAddress: 100,
};
const {
  auctionSpan,
  emergencyAuctionSpan,
  minNormalAuctionPeriod,
  minEmergencyAuctionPeriod,
  normalAuctionRevealSpan,
  emergencyAuctionRevealSpan,
  auctionWithdrawSpan,
  emergencyAuctionWithdrawSpan,
} =
  VERSION === "staging"
    ? auctionSpanConfigStaging
    : auctionSpanConfigProduction;
const {
  maxPriceIndex,
  maxBoardIndex,
  maxBoardIndexAtEndPrice,
  maxBidCountPerAddress,
} = auctionBoardConfig;

export {
  auctionSpan,
  emergencyAuctionSpan,
  minNormalAuctionPeriod,
  minEmergencyAuctionPeriod,
  normalAuctionRevealSpan,
  emergencyAuctionRevealSpan,
  auctionWithdrawSpan,
  emergencyAuctionWithdrawSpan,
  maxPriceIndex,
  maxBoardIndex,
  maxBoardIndexAtEndPrice,
  maxBidCountPerAddress,
};

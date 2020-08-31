const BigNumber = require("bignumber.js");

const minutes = 60;
const hours = 60 * minutes;
const maxUint64 = new BigNumber(2).pow(64).minus(1);

require("dotenv").config();

const {VERSION} = process.env;
console.log("VERSION:", VERSION);
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
const bondMakerConfigStaging = {
  maturityScale: 1,
};
const bondMakerConfigProduction = {
  maturityScale: 3600,
};
const stableCoinConfigStaging = {
  mintIDOLAmountBorder: 10000,
};
const stableCoinConfigProduction = {
  mintIDOLAmountBorder: 500 * 10 ** 8,
};
const auctionBoardConfigStaging = {
  maxPriceIndex: 499,
  maxBoardIndex: maxUint64.toString(10),
  maxBoardIndexAtEndPrice: 999,
  maxBidCountPerAddress: 100,
  minTargetSBTAmount: 10000,
};
const auctionBoardConfigProduction = {
  maxPriceIndex: 499,
  maxBoardIndex: maxUint64.toString(10),
  maxBoardIndexAtEndPrice: 999,
  maxBidCountPerAddress: 100,
  minTargetSBTAmount: 10 ** 8,
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
const {maturityScale} =
  VERSION === "staging" ? bondMakerConfigStaging : bondMakerConfigProduction;
const {mintIDOLAmountBorder} =
  VERSION === "staging" ? stableCoinConfigStaging : stableCoinConfigProduction;
const {
  maxPriceIndex,
  maxBoardIndex,
  maxBoardIndexAtEndPrice,
  maxBidCountPerAddress,
  minTargetSBTAmount,
} =
  VERSION === "staging"
    ? auctionBoardConfigStaging
    : auctionBoardConfigProduction;

module.exports = {
  auctionSpan,
  emergencyAuctionSpan,
  minNormalAuctionPeriod,
  minEmergencyAuctionPeriod,
  normalAuctionRevealSpan,
  emergencyAuctionRevealSpan,
  auctionWithdrawSpan,
  emergencyAuctionWithdrawSpan,
  maturityScale,
  mintIDOLAmountBorder,
  maxPriceIndex,
  maxBoardIndex,
  maxBoardIndexAtEndPrice,
  maxBidCountPerAddress,
  minTargetSBTAmount,
};

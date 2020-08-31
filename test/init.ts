import {
  BondMakerContract,
  StableCoinContract,
  AuctionContract,
  AuctionBoardContract,
} from "../types/truffle-contracts";
import {nullAddress} from "./util";
import {
  auctionSpan,
  emergencyAuctionSpan,
  minNormalAuctionPeriod,
  minEmergencyAuctionPeriod,
  normalAuctionRevealSpan,
  emergencyAuctionRevealSpan,
  auctionWithdrawSpan,
  emergencyAuctionWithdrawSpan,
  mintIDOLAmountBorder,
  maturityScale,
  maxPriceIndex as defaultMaxPriceIndex,
  maxBoardIndex as defaultMaxBoardIndex,
  maxBoardIndexAtEndPrice as defaultMaxBoardIndexAtEndPrice,
  maxBidCountPerAddress,
  minTargetSBTAmount,
} from "./constants";
import BigNumber from "bignumber.js";

const defaultInitRateETH2USD = 200;
const defaultInitVolatility = 0;

const Oracle = artifacts.require("TestOracle");
const LienToken = artifacts.require("TestLienToken");
const BondTokenName = artifacts.require("BondTokenName");
const Wrapper = artifacts.require("Wrapper");

export async function init<
  T extends BondMakerContract,
  U extends StableCoinContract,
  V extends AuctionContract,
  W extends AuctionBoardContract
>(
  BondMaker: T,
  StableCoin: U,
  Auction: V,
  AuctionBoard: W,
  options?: {
    initRateETH2USD?: number;
    initVolatility?: number;
    maxPriceIndex?: number;
    maxBoardIndex?: number;
    maxBoardIndexAtEndPrice?: number;
  }
) {
  const maxUint64 = new BigNumber(2).pow(64).minus(1);
  const maxPriceIndex = new BigNumber(
    options?.maxPriceIndex ?? defaultMaxPriceIndex
  );
  const maxBoardIndex = new BigNumber(
    options?.maxBoardIndex ?? defaultMaxBoardIndex
  );
  const maxBoardIndexAtEndPrice = new BigNumber(
    options?.maxBoardIndexAtEndPrice ?? defaultMaxBoardIndexAtEndPrice
  );
  if (maxPriceIndex.gt(2 ** 16 - 1)) {
    throw new Error("maxPriceIndex must not exceed 2^16 - 1");
  }
  if (maxBoardIndex.gt(maxUint64)) {
    throw new Error("maxBoardIndex must not exceed 2^64 - 1");
  }
  if (maxBoardIndexAtEndPrice.gt(maxUint64)) {
    throw new Error("maxBoardIndexAtEndPrice must not exceed 2^64 - 1");
  }
  const initRateETH2USD = new BigNumber(
    options?.initRateETH2USD ?? defaultInitRateETH2USD
  );
  const initVolatility = new BigNumber(
    options?.initVolatility ?? defaultInitVolatility
  );
  const oracleContract = await Oracle.new(
    initRateETH2USD.shiftedBy(8).toString(10),
    initVolatility.shiftedBy(8).toString(10)
  );
  const lienTokenContract = await LienToken.new();
  const bondTokenNameContract = await BondTokenName.deployed();
  const bondMakerContract = await BondMaker.new(
    oracleContract.address,
    lienTokenContract.address,
    bondTokenNameContract.address,
    maturityScale
  );
  const idolContract = await StableCoin.new(
    oracleContract.address,
    bondMakerContract.address,
    auctionSpan,
    emergencyAuctionSpan,
    mintIDOLAmountBorder
  );
  const auctionBoardContract = await AuctionBoard.new(
    bondMakerContract.address,
    idolContract.address,
    maxPriceIndex.toString(10),
    maxBoardIndex.toString(10),
    maxBoardIndexAtEndPrice.toString(10),
    maxBidCountPerAddress,
    minTargetSBTAmount
  );
  const auctionContract = await Auction.new(
    bondMakerContract.address,
    idolContract.address,
    auctionBoardContract.address,
    minNormalAuctionPeriod,
    minEmergencyAuctionPeriod,
    normalAuctionRevealSpan,
    emergencyAuctionRevealSpan,
    auctionWithdrawSpan,
    emergencyAuctionWithdrawSpan
  );
  const wrapperContract = await Wrapper.new(
    oracleContract.address,
    bondMakerContract.address,
    idolContract.address,
    nullAddress // set exchange factory later
  );
  await idolContract.setAuctionContract(auctionContract.address);
  await auctionBoardContract.setAuctionContract(auctionContract.address);
  return {
    oracle: oracleContract.address,
    bondMaker: bondMakerContract.address,
    idol: idolContract.address,
    auction: auctionContract.address,
    auctionBoard: auctionBoardContract.address,
    wrapper: wrapperContract.address,
    lienToken: lienTokenContract.address,
  };
}

// How to use
//
// const OracleContract = await Oracle.deployed();
// const BondMakerContract = await BondMaker.at(contractAddresses.bondMaker);
// const IDOLContract = await StableCoin.at(contractAddresses.idol);
// const auctionContract = await Auction.at(contractAddresses.auction);

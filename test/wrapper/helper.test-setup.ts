import {BigNumber} from "bignumber.js";

import {
  Pattern3TestCase,
  convertToAuctionInfoIDOL,
  NO_LOWEST_LOSE_BID_PRICE,
  GIVE_UP_TO_MAKE_AUCTION_RESULT,
} from "../scenario/pattern3/utils";
import {
  getBidStatus,
  getWinAmount,
  getBoard,
  discretizeBidPrice,
} from "../scenario/pattern3/generateRandomCase";
import {
  nullAddress,
  advanceTime,
  mineOneBlock,
  days,
  getBlockTimestampSec,
  fromEtherAmount,
  toEtherAmount,
  fromBTAmount,
  fromIDOLAmount,
  toBTAmount,
  toIDOLAmount,
  fromBids,
  diffs,
  encodeUtf8,
  decodeUtf8,
  calcFnMap,
  toBTValue,
  fromStrikePrice,
  fromBTValue,
} from "../util";
import {
  maturityScale,
  auctionSpan,
  minNormalAuctionPeriod,
  minEmergencyAuctionPeriod,
  normalAuctionRevealSpan,
  emergencyAuctionRevealSpan,
  auctionWithdrawSpan,
  emergencyAuctionWithdrawSpan,
  maxPriceIndex,
  maxBoardIndex,
  maxBoardIndexAtEndPrice,
} from "../constants";
import {callRegisterNewBondGroup, callGetBond} from "../bondmaker/callFunction";
import {
  callCloseAuction,
  callMakeAuctionResult,
  callMakeEndInfo,
} from "../auction/callFunction";
import {callRevealBids} from "../auctionBoard/callFunction";
import {callIssueLBTAndIDOL} from "../wrapper/callFunction";
import {callMintIDOL} from "../stablecoin/callFunction";
import {balanceLoggerFactory} from "../scenario/pattern3/pat3Logger";
import Pattern3LambdaSimulator from "../scenario/pattern3/theory/lambdaSimulator";

BigNumber.set({ROUNDING_MODE: BigNumber.ROUND_DOWN});

const LOCK_POOL_BORDER = 0.1;

const TestOracle = artifacts.require("TestOracle");
const StableCoin = artifacts.require("TestStableCoin");
const BondMaker = artifacts.require("TestBondMaker");
const Auction = artifacts.require("TestAuction");
const AuctionBoard = artifacts.require("TestAuctionBoard");
const BondToken = artifacts.require("TestBondToken");
const LienToken = artifacts.require("TestLienToken");
const Wrapper = artifacts.require("Wrapper");
const Helper = artifacts.require("Helper");

export const testHelperPatternFactory = (
  accounts: Truffle.Accounts,
  contractAddresses: {
    oracle: string;
    bondMaker: string;
    idol: string;
    auction: string;
    auctionBoard: string;
    wrapper: string;
    lienToken: string;
  },
  helper: string
) =>
  async function (
    {
      errorMessage,
      users,
      bondGroups,
      useWrapper,
    }: Pattern3TestCase & {useWrapper: boolean},
    logger: {
      log: (...args: any[]) => void;
      warn: (...args: any[]) => void;
      error: (...args: any[]) => void;
      group: (...args: any[]) => void;
      groupEnd: () => void;
    } = {
      log: () => {},
      warn: () => {},
      error: () => {},
      group: () => {},
      groupEnd: () => {},
    }
  ) {
    let bondIDs = new Array<string>();

    const bondMakerContract = await BondMaker.at(contractAddresses.bondMaker);
    const IDOLContract = await StableCoin.at(contractAddresses.idol);
    const auctionContract = await Auction.at(contractAddresses.auction);
    const auctionBoardContract = await AuctionBoard.at(
      contractAddresses.auctionBoard
    );
    const lienTokenContract = await LienToken.at(contractAddresses.lienToken);
    const oracleContract = await TestOracle.at(contractAddresses.oracle);
    const HelperContract = await Helper.at(helper);

    const lambdaSimulator = new Pattern3LambdaSimulator();
    let balanceLogger = balanceLoggerFactory(
      accounts,
      users,
      IDOLContract,
      bondMakerContract
    );

    console.log("\n===============================================");

    for (
      let bondGroupIndex = 0;
      bondGroupIndex < bondGroups.length;
      bondGroupIndex++
    ) {
      const pooledAmountList: {
        [accountIndex: string]: {
          [poolID: string]: {
            pooledIDOLAmount: BigNumber;
            obtainedIDOLAmount: BigNumber;
            lockedSBTAmount: BigNumber;
            burningIDOLAmount: BigNumber;
          };
        };
      } = {};

      logger.log(await balanceLogger(`BondGroup${bondGroupIndex}`, bondIDs));

      const lambdaBeforeUpdate = lambdaSimulator.calcUSD2IDOL(1);
      const bondGroup = (() => {
        const bondGroup = bondGroups[bondGroupIndex];
        const auctions = bondGroup.auctions as typeof bondGroups[number]["auctions"][number][];
        const strikePriceIDOL = lambdaSimulator.calcUSD2IDOL(
          bondGroup.solidStrikePrice
        );
        return {
          ...bondGroup,
          auctions: auctions.map((auctionInfo, auctionRestartedCount) => {
            const betaCount = Math.min(auctionRestartedCount + 1, 9);
            const upperBidPriceLimit = strikePriceIDOL
              .times(1 + betaCount / 10)
              .dp(8);
            const lowerBidPriceLimit = strikePriceIDOL
              .times(1 - betaCount / 10)
              .dp(8);
            if (auctionInfo.priceType !== "USD") {
              return convertToAuctionInfoIDOL(
                auctionInfo,
                upperBidPriceLimit,
                lowerBidPriceLimit,
                1
              );
            }

            return convertToAuctionInfoIDOL(
              auctionInfo,
              upperBidPriceLimit,
              lowerBidPriceLimit,
              lambdaBeforeUpdate
            );
          }),
        };
      })();
      const {etherStatus, solidStrikePrice, assets, auctions} = bondGroup;

      const {
        totalUnlockedSBT,
        totalBurnedIDOL,
        isLast: expectedIsLast,
      } = lambdaSimulator.updateLambda(bondGroup);
      console.log("expected settled price", totalUnlockedSBT, totalBurnedIDOL);

      // Register SBT and LBT.
      const now = await getBlockTimestampSec();
      let maturity: number;
      {
        const beforeRegisteringBonds = etherStatus?.beforeRegisteringBonds;
        const untilMaturity =
          beforeRegisteringBonds?.untilMaturity ?? auctionSpan + days;
        const rateETH2USD = beforeRegisteringBonds?.rateETH2USD;
        const volatility = beforeRegisteringBonds?.volatility ?? 0;

        maturity =
          Math.ceil((now + untilMaturity) / maturityScale) * maturityScale;

        if (rateETH2USD !== undefined) {
          await oracleContract.testSetOracleData(
            new BigNumber(rateETH2USD).shiftedBy(8).toString(10),
            new BigNumber(volatility).shiftedBy(8).toString(10)
          );
        }
      }

      bondIDs = await Promise.all(
        calcFnMap(solidStrikePrice).map(async ({fnMap}) => {
          const bondID = await bondMakerContract.generateBondID(
            maturity,
            fnMap
          );
          const {bondTokenAddress} = await callGetBond(
            bondMakerContract,
            bondID
          );

          // Register a bond if necessary.
          if (bondTokenAddress === nullAddress) {
            await bondMakerContract.registerNewBond(maturity, fnMap);
          }

          return bondID;
        })
      );

      // Register bond group contains registered SBT and LBT.
      const {bondGroupID} = await callRegisterNewBondGroup(
        bondMakerContract,
        bondIDs,
        maturity
      );

      // Obtain the bondID of a solid bond included in the bond group.
      // Find one with a stable strike price that is not 0.
      const {
        bondID: solidBondID,
        bondAddress: solidBondAddress,
      } = await (async () => {
        const strikePriceListOfBonds = await Promise.all(
          bondIDs.map(async (bondID) => {
            const {bondTokenAddress, solidStrikePrice} = await callGetBond(
              bondMakerContract,
              bondID
            );
            return {
              bondID,
              bondAddress: bondTokenAddress,
              strikePrice: solidStrikePrice,
            };
          })
        );
        return strikePriceListOfBonds.filter(
          ({strikePrice}) => !strikePrice.eq(0)
        )[0];
      })();
      const solidBondContract = await BondToken.at(solidBondAddress);

      // Each account issues bond group registered.
      console.log("\n## exec mint (iDOL)\n");
      const okBond = await HelperContract.isAcceptableSBT(
        solidBondID,
        20000000000,
        50000000
      );
      console.log("Bond acceptable: ", okBond);
      for (const [
        accountIndex,
        {mintingBondAmount, lockingSBTAmount, burningIDOLValue},
      ] of Object.entries(assets)) {
        const mintAmount = new BigNumber(mintingBondAmount);
        const lockAmount = new BigNumber(lockingSBTAmount);
        const burningIDOLAmount = toIDOLAmount(
          await IDOLContract.calcSBT2IDOL(
            new BigNumber(burningIDOLValue || 0)
              .shiftedBy(12)
              .dp(0)
              .toString(10)
          )
        );
        if (mintAmount.lte(0)) {
          continue;
        }

        const expectedMintingAmount = toIDOLAmount(
          await IDOLContract.calcSBT2IDOL(
            lockAmount.times(solidStrikePrice).shiftedBy(12).dp(0).toString(10)
          )
        );
        const expectedPooledAmount = expectedMintingAmount
          .times(LOCK_POOL_BORDER)
          .dp(8);
        const expectedObtainedAmount = expectedMintingAmount.minus(
          expectedPooledAmount
        );
        console.group(`(account ${accountIndex})`);
        console.log(
          "expected minting amount:",
          expectedMintingAmount.toString(10)
        );
        console.groupEnd();

        const getBalanceDiff = diffs(async () => {
          const balance = await web3.eth.getBalance(lienTokenContract.address);
          const balance2 = await IDOLContract.balanceOf(accounts[accountIndex]);
          return [toEtherAmount(balance), toIDOLAmount(balance2)];
        });

        const balanceDiff = await getBalanceDiff(async () => {
          let poolID: string;
          // Each account issues iDOL by locking SBT.
          if (useWrapper) {
            await bondMakerContract.issueNewBonds(bondGroupID, {
              from: accounts[accountIndex],
              value: fromEtherAmount(
                mintAmount.minus(lockAmount).times(1002).div(1000)
              ),
            });
            const wrapperContract = await Wrapper.at(contractAddresses.wrapper);
            const {poolID: actualPoolID} = await callIssueLBTAndIDOL(
              wrapperContract,
              bondGroupID,
              {
                from: accounts[accountIndex],
                value: fromEtherAmount(lockAmount.times(1002).div(1000)),
              }
            );
            poolID = actualPoolID;
          } else {
            await bondMakerContract.issueNewBonds(bondGroupID, {
              from: accounts[accountIndex],
              value: fromEtherAmount(mintAmount.times(1002).div(1000)),
            });
            await solidBondContract.increaseAllowance(
              contractAddresses.idol,
              fromBTAmount(lockAmount),
              {
                from: accounts[accountIndex],
              }
            );
            const {poolID: actualPoolID} = await callMintIDOL(
              IDOLContract,
              solidBondID,
              accounts[accountIndex],
              fromBTAmount(lockAmount),
              {
                from: accounts[accountIndex],
              }
            );
            poolID = actualPoolID;
          }

          if (burningIDOLValue !== undefined) {
            await IDOLContract.unlockSBT(
              solidBondID,
              fromIDOLAmount(burningIDOLAmount),
              {
                from: accounts[accountIndex],
              }
            );
          }

          if (!Object.keys(pooledAmountList).includes(accountIndex)) {
            pooledAmountList[accountIndex] = {};
          }

          if (!Object.keys(pooledAmountList[accountIndex]).includes(poolID)) {
            pooledAmountList[accountIndex][poolID] = {
              pooledIDOLAmount: new BigNumber(0),
              obtainedIDOLAmount: new BigNumber(0),
              lockedSBTAmount: new BigNumber(0),
              burningIDOLAmount: new BigNumber(0),
            };
          }

          const pooledAmount = pooledAmountList[accountIndex][poolID];
          pooledAmount.pooledIDOLAmount = pooledAmount.pooledIDOLAmount.plus(
            expectedPooledAmount
          );
          pooledAmount.obtainedIDOLAmount = pooledAmount.obtainedIDOLAmount.plus(
            expectedObtainedAmount
          );
          pooledAmount.lockedSBTAmount = pooledAmount.lockedSBTAmount.plus(
            new BigNumber(lockingSBTAmount).dp(8)
          );
          pooledAmount.burningIDOLAmount = pooledAmount.burningIDOLAmount.plus(
            new BigNumber(burningIDOLAmount || 0).dp(8)
          );
          pooledAmountList[accountIndex][poolID] = pooledAmount;
        });

        assert.equal(
          balanceDiff[0].toString(10),
          mintAmount.times(0.002).toString(10),
          "issueNewBonds fee must be 0.2%"
        );

        assert.equal(
          balanceDiff[1].toString(10),
          expectedObtainedAmount.minus(burningIDOLAmount).toString(10),
          "the obtained iDOL amount differ from expected"
        );
      }

      logger.log(await balanceLogger(`after mint (iDOL)`, bondIDs));

      let isLast = false;

      // Start auction.
      {
        const {maturity} = await callGetBond(bondMakerContract, solidBondID);

        if (etherStatus?.beforeStartingAuction !== undefined) {
          const now = await getBlockTimestampSec();

          const {
            rateETH2USD,
            volatility,
            untilMaturity,
          } = etherStatus.beforeStartingAuction;
          if (maturity - untilMaturity < now) {
            throw new Error("Time was exceeded.");
          }

          await advanceTime(maturity - untilMaturity - now);
          await mineOneBlock();

          await oracleContract.testSetOracleData(
            new BigNumber(rateETH2USD).shiftedBy(8).toString(10),
            new BigNumber(volatility).shiftedBy(8).toString(10)
          );
        }

        const now = await getBlockTimestampSec();
        const rateETH2USD = await oracleContract.latestPrice.call();
        const volatility = await oracleContract.getVolatility.call();
        const isInEmergency = await IDOLContract.isInEmergency(
          rateETH2USD,
          fromStrikePrice(solidStrikePrice),
          volatility,
          maturity - now
        );

        if (isInEmergency) {
          console.log("The SBT is in emergency.");
          try {
            const poolID = await IDOLContract.getCurrentPoolID(solidBondID);
            const poolInfo = await IDOLContract.getPoolInfo(poolID);
            const lockedSolidBondTotal = poolInfo[0];
            await IDOLContract.startAuctionByMarket(solidBondID);
            if (lockedSolidBondTotal.toString() === "0") {
              isLast = true;
            }
          } catch (err) {
            assert.equal(
              err.message,
              errorMessage,
              "fail to execute startAuctionByMarket"
            );
            return;
          }
        } else {
          // Advance time to just before maturity.
          if (now < maturity - auctionSpan) {
            await advanceTime(maturity - auctionSpan - now);
            await mineOneBlock();
          }

          console.log("The SBT is in the auction span.");
          try {
            const poolID = await IDOLContract.getCurrentPoolID(solidBondID);
            const poolInfo = await IDOLContract.getPoolInfo(poolID);
            const lockedSolidBondTotal = poolInfo[0];
            await IDOLContract.startAuctionOnMaturity(solidBondID);
            if (lockedSolidBondTotal.toString() === "0") {
              isLast = true;
            }
          } catch (err) {
            assert.equal(
              err.message,
              errorMessage,
              "fail to execute startAuctionOnMaturity"
            );
            return;
          }
        }
      }

      let isInvalidMyLowestPriceFlag = false;
      for (
        let auctionIndex = 0;
        auctionIndex < auctions.length;
        auctionIndex++
      ) {
        console.log(
          `\n## BondGroup${bondGroupIndex} Trigger0 Auction${auctionIndex}\n`
        );
        logger.log(
          await balanceLogger(
            `BondGroup${bondGroupIndex} Trigger0 Auction${auctionIndex}`,
            bondIDs
          )
        );

        if (
          isLast &&
          errorMessage ===
            "there is no auction amount, but the bids of auction is given"
        ) {
          console.log(
            "expected error:",
            "there is no auction amount, but the bids of auction is given"
          );
          return;
        }
        assert.ok(
          !isLast,
          "there is no auction amount, but the bids of auction is given"
        );

        console.log("\n## after startAuction\n");
        const {
          bids,
          actions,
          giveUpSortBidPrice,
          giveUpMakeEndInfo,
          isReceivingWinBidsLately,
        } = {
          ...auctions[auctionIndex],
        };
        const auctionID = await auctionContract.getCurrentAuctionID(
          solidBondID
        );
        console.log("auctionID:", auctionID);
        const isEmergency = await auctionContract.isAuctionEmergency(auctionID);
        console.log("isEmergency:", isEmergency);

        const ongoingSBTAmount = toBTAmount(
          await auctionContract.ongoingAuctionSBTTotal(auctionID)
        );
        console.log("ongoingAuctionSBTTotal:", ongoingSBTAmount.toString(10));
        // const closingTime = await auctionContract.auctionClosingTime(auctionID);
        // const now = await getBlockTimestampSec();
        // console.log('closing time:', closingTime.toString(), now);
        // console.log(
        //     'time control flag:',
        //     (await auctionContract.getTimeControlFlag(auctionID)).toString()
        // );
        // console.log(await auctionFlag(auctionContract, auctionID));

        const secrets: {
          [secret: string]: {
            accountIndex: number;
            auctionID: string;
            bids: string[];
            random: string;
            unrevealed: boolean;
          };
        } = {};

        console.log("\n## exec bid:\n");
        // Each account will place a buy order as per the test case.
        console.log(
          "strike price:",
          new BigNumber(solidStrikePrice).toFixed(4)
        );
        for (const [
          bidIndex,
          {accountIndex, price, amount: SBTAmount, random, early, unrevealed},
        ] of bids.entries()) {
          // console.log(`(account ${accountIndex}) bid price:`, price.toString(10));
          // assert.ok(
          //     new BN(price).isLessThanOrEqualTo(solidStrikePrice),
          //     'invalid test cases: bid price'
          // );
          if (price === undefined) {
            continue;
          }

          const secret = await auctionBoardContract.generateMultiSecret(
            auctionID,
            [fromIDOLAmount(price), fromBTAmount(SBTAmount)],
            new BigNumber(random || bidIndex).dp(0).toString(10)
          );

          const totalIDOLAmount = await IDOLContract.calcSBT2IDOL(
            new BigNumber(solidStrikePrice)
              .times(SBTAmount)
              .shiftedBy(12)
              .dp(0)
              .toString(10)
          );
          await IDOLContract.increaseAllowance(
            contractAddresses.auctionBoard,
            totalIDOLAmount,
            {
              from: accounts[accountIndex],
            }
          );
          console.group(`(account ${accountIndex})`);
          console.log(
            "price (before discretized):",
            new BigNumber(price).toFixed(4)
          );
          console.log(
            `target SBT amount:         `,
            new BigNumber(SBTAmount).toFixed(8)
          );

          try {
            const balance = await IDOLContract.balanceOf(
              accounts[accountIndex]
            );
            console.log("iDOL balance", balance.toString());
            const memo = "encrypted bid info";
            const res = await auctionBoardContract.bidWithMemo(
              auctionID,
              secret,
              fromBTAmount(SBTAmount),
              encodeUtf8(memo),
              {
                from: accounts[accountIndex],
              }
            );

            for (const log of res.logs) {
              if (log.event === "LogBidMemo") {
                const actualMemo = decodeUtf8(log.args.memo);
                assert.equal(actualMemo, memo, "memo is differ from expected");
              }
            }

            console.log("gasUsed:", res.receipt.gasUsed);
          } catch (err) {
            const output =
              `fail to execute bid by\n` +
              `   account ${accountIndex}\n` +
              `   price ${price}\n` +
              `   amount ${SBTAmount}\n`;
            assert.equal(err.message, errorMessage, output);
            return;
          } finally {
            console.groupEnd();
          }

          if (early) {
            console.log("early pass");
          } else {
            secrets[secret] = {
              accountIndex: accountIndex,
              auctionID,
              bids: [fromIDOLAmount(price), fromBTAmount(SBTAmount)],
              random: new BigNumber(random || bidIndex).dp(0).toString(10),
              unrevealed: unrevealed === true,
            };
          }
        }

        logger.log(await balanceLogger(`after bid`, bondIDs));
        // }

        // Advance time until each account can reveal own bids.
        if (isEmergency) {
          await advanceTime(minEmergencyAuctionPeriod + days / 24 / 12 + 1);
        } else {
          await advanceTime(minNormalAuctionPeriod + days / 24 + 1);
        }
        await mineOneBlock();

        console.log("\n## exec revealBid\n");
        for (const [
          secret,
          {accountIndex, bids, random, unrevealed},
        ] of Object.entries(secrets)) {
          // console.log(`account ${accountIndex}: ${accounts[accountIndex]}`);
          if (unrevealed) {
            continue;
          }

          let bidIndex: {
            bidPrice: string;
            boardIndex: number;
          };
          try {
            console.log("HELPER TEST");
            const res = await HelperContract.revealBidsThree(
              auctionID,
              bids,
              random,
              [],
              0,
              [],
              0,
              {
                from: accounts[accountIndex],
              }
            );
            for (const log of res.logs) {
              if (log.event == "LogInsertBoard") {
                return {
                  bidPrice: log.args.bidPrice.toString(10),
                  boardIndex: log.args.boardIndex.toNumber(),
                };
              }
              throw new Error("event log of revealBid was not found");
            }
          } catch (err) {
            assert.equal(
              err.message,
              errorMessage,
              "fail to execute revealBids"
            );
            return;
          }

          delete secrets[secret];

          console.group(`(account ${accountIndex})`);
          console.groupEnd();
        }
        logger.log(await balanceLogger(`after revealBid`, bondIDs));

        if (isEmergency) {
          await advanceTime(emergencyAuctionRevealSpan);
        } else {
          await advanceTime(normalAuctionRevealSpan);
        }
        await mineOneBlock();

        const unsortedBidPrice = (
          await auctionBoardContract.getUnsortedBidPrice(auctionID)
        ).map((v) => v.toString());

        // Sort bid orders by bid price.
        const sortedPrice = unsortedBidPrice.sort((a, b) => {
          return new BigNumber(b).comparedTo(a);
        });

        await HelperContract.manageOperationInReceivingPeriod(
          auctionID,
          sortedPrice,
          {
            from: accounts[0],
          }
        );

        const endInfo = await auctionBoardContract.getEndInfo(auctionID);
        console.log("ENDINFO:");
        console.log(
          endInfo[0].toString(),
          ":",
          endInfo[1].toString(),
          ":",
          endInfo[2].toString(),
          ":",
          endInfo[3].toString()
        );
        console.log("HELPER TEST DONE");
      }
    }
  };

import {BigNumber} from "bignumber.js";

import {Pattern3TestCase, convertToAuctionInfoIDOL} from "./utils";
import {getBidStatus} from "./generateRandomCase";
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
} from "../../util";
import {
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
} from "../../constants";
import {
  callRegisterNewBondGroup,
  callGetBond,
} from "../../bondmaker/callFunction";
import {
  callCloseAuction,
  callMakeAuctionResult,
  callMakeEndInfo,
} from "../../auction/callFunction";
import {callRevealBids} from "../../auctionBoard/callFunction";
import {callIssueLBTAndIDOL} from "../../wrapper/callFunction";
import {callMintIDOL} from "../../stablecoin/callFunction";
import {balanceLoggerFactory} from "./pat3Logger";
import Pattern3LambdaSimulator from "./theory/lambdaSimulator";

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

export const testPattern3Factory = (
  accounts: Truffle.Accounts,
  contractAddresses: {
    oracle: string;
    bondMaker: string;
    idol: string;
    auction: string;
    auctionBoard: string;
    wrapper: string;
    lienToken: string;
  }
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
        return {
          ...bondGroup,
          auctions: auctions.map((auctionInfo) => {
            if (auctionInfo.priceType !== "USD") {
              return convertToAuctionInfoIDOL(auctionInfo, 1);
            }

            return convertToAuctionInfoIDOL(auctionInfo, lambdaBeforeUpdate);
          }),
        };
      })();
      const {etherStatus, solidStrikePrice, assets, auctions} = bondGroup;

      const {
        totalUnlockedSBT,
        totalBurnedIDOL,
        isLast: expectedIsLast,
      } = lambdaSimulator.updateLambda(bondGroup);

      // Register SBT and LBT.
      const now = await getBlockTimestampSec();
      let maturity: number;
      {
        const {
          rateETH2USD,
          volatility,
          untilMaturity,
        } = etherStatus?.beforeRegisteringBonds || {
          rateETH2USD: 200,
          volatility: 0,
          untilMaturity: auctionSpan + days,
        };

        maturity = now + untilMaturity;

        await oracleContract.testSetOracleData(
          new BigNumber(rateETH2USD).shiftedBy(8).toString(10),
          new BigNumber(volatility).shiftedBy(8).toString(10)
        );
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

      // const solidPoolID = await IDOLContract.getCurrentPoolID(solidBondID);
      const isInvalidMyLowestPriceList: {
        [accountIndex: string]: true | undefined;
      } = {};
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
        const {bids, actions} = auctions[auctionIndex];
        const auctionID = await auctionContract.getCurrentAuctionID(
          solidBondID
        );
        console.log("auctionID:", auctionID);
        const isEmergency = await auctionContract.isAuctionEmergency(auctionID);
        console.log("isEmergency:", isEmergency);

        {
          const ongoingSBTAmount = await auctionContract.ongoingAuctionSBTTotal(
            auctionID
          );
          console.log(
            "ongoingAuctionSBTTotal:",
            toBTAmount(ongoingSBTAmount).toString(10)
          );
          // const closingTime = await auctionContract.auctionClosingTime(auctionID);
          // const now = await getBlockTimestampSec();
          // console.log('closing time:', closingTime.toString(), now);
          // console.log(
          //     'time control flag:',
          //     (await auctionContract.getTimeControlFlag(auctionID)).toString()
          // );
          // console.log(await auctionFlag(auctionContract, auctionID));
        }

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
            try {
              await callRevealBids(
                auctionBoardContract,
                auctionID,
                [fromIDOLAmount(price), fromBTAmount(SBTAmount)],
                new BigNumber(random || bidIndex).dp(0).toString(10),
                {
                  from: accounts[0],
                }
              );
            } catch (err) {
              assert.equal(
                err.message,
                errorMessage,
                "fail to execute revealBids"
              );
              return;
            }
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

        // console.log(
        //     'getTimeControlFlag',
        //     (await auctionContract.getTimeControlFlag(auctionID)).toString(10)
        // );
        // console.log(await auctionFlag(auctionContract, auctionID));

        // Each account reveal own bids.
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
            bidIndex = await callRevealBids(
              auctionBoardContract,
              auctionID,
              bids,
              random,
              {
                from: accounts[accountIndex],
              }
            );
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
          console.log("bidIndex:", bidIndex);
          console.groupEnd();

          assert.equal(
            bidIndex.bidPrice,
            bids[0],
            "the bid price is differ from the input price"
          );
        }
        logger.log(await balanceLogger(`after revealBid`, bondIDs));

        if (isEmergency) {
          await advanceTime(emergencyAuctionRevealSpan);
        } else {
          await advanceTime(normalAuctionRevealSpan);
        }
        await mineOneBlock();

        // console.log(await auctionFlag(auctionContract, auctionID));

        const unsortedBidPrice = (
          await auctionBoardContract.getUnsortedBidPrice(auctionID)
        ).map((v) => v.toString());

        // Sort bid orders by bid price.
        const sortedPrice = unsortedBidPrice.sort((a, b) => {
          return new BigNumber(b).comparedTo(a);
        });

        for (const accountIndex of Object.keys(actions)) {
          const {
            "0": toBack,
            "1": isIDOLReturned,
          } = await auctionBoardContract.getBidderStatus(
            auctionID,
            accounts[accountIndex]
          );
          console.group(`(account ${accountIndex})`);
          console.log("toBack:", toIDOLAmount(toBack.toString()).toString(10));
          console.log("isIDOLReturned:", isIDOLReturned);
          console.groupEnd();
        }

        await auctionBoardContract.sortBidPrice(auctionID, sortedPrice, {
          from: accounts[0],
        });

        {
          const {
            "0": closingTime,
            "1": auctionAmount,
            "2": rewardedAmount,
            "3": totalSBTAmountBid,
            "4": isEmergency,
            "5": doneFinalizeWinnerAmount,
            "6": doneSortPrice,
            "7": lowestBidPriceDeadLine,
            "8": highestBidPriceDeadLine,
          } = await auctionContract.getAuctionStatus(auctionID);
          logger.log("closing time:", Number(closingTime.toString()));
          logger.log(
            "auction amount:",
            new BigNumber(auctionAmount.toString()).shiftedBy(-8).toString(10)
          );
          logger.log(
            "rewarded amount:",
            new BigNumber(rewardedAmount.toString()).shiftedBy(-8).toString(10)
          );
          logger.log(
            "total SBT amount bid",
            new BigNumber(totalSBTAmountBid.toString())
              .shiftedBy(-8)
              .toString(10)
          );
          logger.log("Is this auction emergency? -", isEmergency);
          logger.log("Has this auction sorted bid price? -", doneSortPrice);
          logger.log(
            "Has this auction finalized winner amount? -",
            doneFinalizeWinnerAmount
          );
          logger.log(
            "highest bid price",
            toIDOLAmount(highestBidPriceDeadLine).toFixed(8)
          );
          logger.log(
            "lowest bid price",
            toIDOLAmount(lowestBidPriceDeadLine).toFixed(8)
          );
        }

        // Decide auction winners by endAuction.

        {
          console.log("\n## exec makeEndInfo\n");
          logger.log("\n## exec makeEndInfo\n");
          const {settledAmount, paidIDOL, rewardedSBT} = await callMakeEndInfo(
            auctionBoardContract,
            auctionID
          );
          logger.log("auction info diff:");
          logger.log("    settledAmount:", settledAmount);
          logger.log("    paidIDOL:     ", paidIDOL);
          logger.log("    rewardedSBT:  ", rewardedSBT);
        }

        {
          const sortedBidPrice = await auctionBoardContract.getSortedBidPrice(
            auctionID
          );
          const boardStatus = await auctionBoardContract.getBoardStatus(
            auctionID
          );
          const bidStats = boardStatus.reduce((acc, val, index) => {
            const price = new BigNumber(sortedBidPrice[index].toString())
              .shiftedBy(-8)
              .toString(10);
            const totalSBTAmount = new BigNumber(val.toString())
              .shiftedBy(-8)
              .toString(10);
            return [...acc, {price, totalSBTAmount}];
          }, new Array<{price: string; totalSBTAmount: string}>());
          logger.log("bid stats:", bidStats);

          let endPrice: BigNumber;
          let endBoardIndex: number;
          let loseSBTAmount: BigNumber;
          let auctionEndPriceWinnerSBTAmount: BigNumber;
          try {
            const endInfo = await auctionBoardContract.getEndInfo(auctionID);
            endPrice = toIDOLAmount(endInfo[0]);
            endBoardIndex = Number(endInfo[1].toString());
            loseSBTAmount = toBTAmount(endInfo[2]);
            auctionEndPriceWinnerSBTAmount = toBTAmount(endInfo[3]);
          } catch (err) {
            assert.equal(
              err.message,
              errorMessage,
              "fail to execute getEndInfo"
            );
            return;
          }

          logger.group("end info:");
          if (
            endPrice.eq(0) &&
            endBoardIndex === 0 &&
            loseSBTAmount.eq(0) &&
            auctionEndPriceWinnerSBTAmount.eq(0)
          ) {
            logger.log("nothing");
          } else {
            logger.log("price:", endPrice.toString(10));
            logger.log("board index:", endBoardIndex);
            logger.log("lose SBT amount:", loseSBTAmount.toString(10));
            logger.log(
              "total winning SBT amount at the lowest winner price:",
              auctionEndPriceWinnerSBTAmount.toString(10)
            );
          }
          logger.groupEnd();

          for (const accountIndex of users) {
            const theoryBids: {[price: string]: number[]} = {};
            const actualMyLoseBids = new Array<{
              price: BigNumber.Value;
              boardIndex: number;
            }>();
            const actualMyWinBids = new Array<{
              price: BigNumber.Value;
              boardIndex: number;
            }>();
            for (const {
              accountIndex: bidder,
              price,
              early,
              unrevealed,
            } of bids) {
              if (unrevealed) {
                continue;
              }

              const strikePriceIDOL = await IDOLContract.calcSBT2IDOL(
                fromBTValue(solidStrikePrice)
              );
              const bidPrice = early
                ? toIDOLAmount(strikePriceIDOL)
                : new BigNumber(price);
              const oldBids = theoryBids[bidPrice.toString()] || [];

              const boardIndex = oldBids.length;
              theoryBids[bidPrice.toString()] = [...oldBids, bidder];

              if (bidder.toString() === accountIndex.toString()) {
                const {isWinBid, isLoseBid} = getBidStatus(
                  bidPrice,
                  boardIndex,
                  endPrice,
                  endBoardIndex,
                  loseSBTAmount,
                  auctionEndPriceWinnerSBTAmount
                );
                if (isWinBid) {
                  actualMyWinBids.push({
                    price: bidPrice,
                    boardIndex: boardIndex,
                  });
                }
                if (isLoseBid) {
                  actualMyLoseBids.push({
                    price: bidPrice,
                    boardIndex: boardIndex,
                  });
                }
              }
            }
            logger.group(`(account ${accountIndex})`);
            logger.group("correct:");
            logger.log("myLoseBids:", fromBids(actualMyLoseBids).toString());
            logger.log("myWinBids:", fromBids(actualMyWinBids).toString());
            logger.groupEnd();
            logger.group("input:");
            logger.log(
              "myLoseBids:",
              fromBids(
                actions[accountIndex]?.result?.myLoseBids || []
              ).toString()
            );
            logger.log(
              "myWinBids:",
              fromBids(
                actions[accountIndex]?.result?.myWinBids || []
              ).toString()
            );
            logger.groupEnd();
            logger.groupEnd();
          }
        }

        const winnerAmountMap = new Map<string, BigNumber>();
        for (const [accountIndex, {result}] of Object.entries(actions)) {
          if (result === null) {
            continue;
          }

          const {myWinBids} = result;
          if (myWinBids.length === 0) {
            continue;
          }

          try {
            const winnerAmount = await auctionContract.calcWinnerAmount(
              auctionID,
              accounts[accountIndex],
              fromBids(myWinBids)
            );
            console.group(`(account ${accountIndex})`);
            console.log(
              "winner amount:",
              toIDOLAmount(winnerAmount).toFixed(8)
            );
            console.groupEnd();
            winnerAmountMap.set(
              accountIndex,
              toBTAmount(winnerAmount).plus(
                winnerAmountMap.get(accountIndex) || 0
              )
            );
          } catch (err) {
            assert.equal(
              err.message,
              errorMessage,
              "fail to execute calcWinnerAmount\n" +
                "(current parameter: " +
                auctionID +
                ", " +
                accounts[accountIndex] +
                ", [" +
                fromBids(myWinBids).toString() +
                "])"
            );
            return;
          }
        }

        logger.log(await balanceLogger(`before makeAuctionResult`, bondIDs));

        for (const [secret, {accountIndex, unrevealed}] of Object.entries(
          secrets
        )) {
          if (!unrevealed) {
            console.log(
              `The secret ${secret.slice(0, 7)}... is already revealed.`
            );
            continue;
          }

          try {
            await auctionContract.receiveUnrevealedBidDistribution(
              auctionID,
              secret,
              {
                from: accounts[accountIndex],
              }
            );
          } catch (err) {
            if (
              err.message ===
              "Returned error: VM Exception while processing transaction: revert secret was not found -- Reason given: secret was not found."
            ) {
              console.log(
                `The secret ${secret.slice(0, 9)}... is already revealed.`
              );
              continue;
            }

            assert.equal(
              err.message,
              errorMessage,
              `fail to execute receiveUnrevealedBidDistribution`
            );
            return;
          }
        }

        // The winner of the auction gets the SBT he bought by calling the winBidReward function.
        logger.log(`## calcBillAndCheckLoserBids\n`);
        for (const [accountIndex, {result}] of Object.entries(actions)) {
          if (result === null) {
            continue;
          }

          const {invalidMyLowestPrice, myLowestPrice, myLoseBids} = result;
          logger.group(`(account ${accountIndex})`);
          logger.log(
            "winner amount:",
            fromBTAmount(winnerAmountMap.get(accountIndex) || 0)
          );

          try {
            const actualMyLowestPrice = await auctionBoardContract.calcMyLowestPrice(
              auctionID,
              fromBTAmount(winnerAmountMap.get(accountIndex) || 0),
              fromBids(myLoseBids)
            );

            const expectedMyLowestPrice =
              myLowestPrice === "NO_LOWEST_LOSE_BID_PRICE"
                ? new BigNumber(2).pow(64).minus(1).toString(10)
                : fromIDOLAmount(myLowestPrice);
            logger.group("my lowest price:", actualMyLowestPrice.toString());
            logger.log("actual:", actualMyLowestPrice.toString());
            logger.log("input: ", expectedMyLowestPrice);
            logger.groupEnd();
            logger.groupEnd();
            if (actualMyLowestPrice.toString() !== expectedMyLowestPrice) {
              if (invalidMyLowestPrice) {
                isInvalidMyLowestPriceList[accountIndex] = true;
              } else {
                assert.fail(
                  `(account ${accountIndex}) ` +
                    "must not input invalid bid results without invalidMyLowestPrice flag in the test case"
                );
              }
            }
          } catch (err) {
            assert.equal(
              err.message,
              errorMessage,
              "fail to execute calcMyLowestPrice"
            );
          }

          try {
            await auctionContract.calcBillAndCheckLoserBids(
              auctionID,
              accounts[accountIndex],
              fromBTAmount(winnerAmountMap.get(accountIndex) || 0),
              myLowestPrice === "NO_LOWEST_LOSE_BID_PRICE"
                ? new BigNumber(2).pow(64).minus(1).toString(10)
                : fromIDOLAmount(myLowestPrice),
              fromBids(myLoseBids)
            );
          } catch (err) {
            assert.equal(
              err.message,
              errorMessage,
              "fail to execute calcBillAndCheckLoserBids\n" +
                "(current parameter: " +
                auctionID +
                ", " +
                accounts[accountIndex] +
                ", " +
                fromBTAmount(winnerAmountMap.get(accountIndex) || 0) +
                ", " +
                myLowestPrice +
                ", [" +
                fromBids(myLoseBids) +
                "]"
            );
            return;
          }
        }

        logger.log("");
        logger.log(
          await balanceLogger(`after calcBillAndCheckLoserBids`, bondIDs)
        );

        console.log("\n## exec makeAuctionResult\n");
        for (const [accountIndex, {result}] of Object.entries(actions)) {
          try {
            if (result === null) {
              continue;
            }

            const {myLowestPrice, myLoseBids, myWinBids} = result;

            console.log(`(account${accountIndex})`);
            logger.group(`(account${accountIndex})`);
            const {
              SBTAmountOfReward,
              IDOLAmountOfPayment,
              IDOLAmountOfChange,
            } = await callMakeAuctionResult(
              auctionContract,
              auctionID,
              myLowestPrice === "NO_LOWEST_LOSE_BID_PRICE"
                ? new BigNumber(2).pow(64).minus(1).toString(10)
                : fromIDOLAmount(myLowestPrice),
              fromBids(myWinBids),
              fromBids(myLoseBids),
              {
                from: accounts[accountIndex],
              }
            );
            logger.log("   SBTAmountOfReward:  ", SBTAmountOfReward.toString());
            logger.log(
              "   IDOLAmountOfPayment:",
              IDOLAmountOfPayment.toString()
            );
            logger.log(
              "   IDOLAmountOfChange: ",
              IDOLAmountOfChange.toString()
            );
            logger.groupEnd();
          } catch (err) {
            if (
              err.message ===
              "Returned error: VM Exception while processing transaction: revert This process is already done -- Reason given: This process is already done."
            ) {
              continue;
            }

            assert.equal(
              err.message,
              errorMessage,
              `fail to execute makeAuctionResult`
            );
            return;
          }
        }

        logger.log(await balanceLogger(`after makeAuctionResult`, bondIDs));

        if (isEmergency) {
          await advanceTime(emergencyAuctionWithdrawSpan);
        } else {
          await advanceTime(auctionWithdrawSpan);
        }
        await mineOneBlock();

        // console.log(await auctionContract.getTimeControlFlag(auctionID));
        // console.log(await auctionFlag(auctionContract, auctionID));

        logger.log(await balanceLogger(`before callCloseAuction`, bondIDs));

        console.log("\n## exec callCloseAuction\n");
        {
          const {isLast: actualIsLast} = await callCloseAuction(
            auctionContract,
            auctionID
          );
          logger.log("isLast:", actualIsLast?.toString());
          isLast = actualIsLast;
        }

        logger.log(await balanceLogger(`after callCloseAuction`, bondIDs));
      }

      if (errorMessage === "isLast differ from expected") {
        console.log("expected error: isLast differ from expected");
        return;
      }
      assert.equal(isLast, expectedIsLast, "isLast differ from expected");

      if (useWrapper) {
        console.log("\n## returnLockedPoolUsers\n");
        logger.log("## returnLockedPoolUsers\n");
      } else {
        console.log("\n## returnLockedPool\n");
        logger.log("## returnLockedPool\n");
      }

      const expectedSettledAveragePrice = totalUnlockedSBT.eq(0)
        ? new BigNumber(0)
        : totalBurnedIDOL.div(totalUnlockedSBT).dp(8);
      logger.log(
        "expectedSettledAveragePrice (iDOL/SBT):",
        expectedSettledAveragePrice.toFixed(8)
      );

      for (const accountIndex of Object.keys(pooledAmountList)) {
        const beforeBalance = toIDOLAmount(
          await IDOLContract.balanceOf(accounts[accountIndex])
        );

        const poolIDs = Object.keys(pooledAmountList[accountIndex] || {});
        console.log("poolIDs", poolIDs);
        for (const poolID of poolIDs) {
          const actualSettledAveragePrice = await IDOLContract.getSettledAveragePrice(
            poolID
          );
          logger.log(
            `pool ID ${poolID.slice(0, 7)}...`,
            "actualSettledAveragePrice (iDOL/SBT):",
            toIDOLAmount(actualSettledAveragePrice).toFixed(8)
          );
        }

        if (useWrapper) {
          // In the case that you mint iDOL by wrapper contract methods such as issueLBTAndIDOL,
          // because your locked amount is managed in the wrapper contract.
          const res = await IDOLContract.returnLockedPool(poolIDs, {
            from: accounts[accountIndex],
          });
          console.log("gasUsed:", res.receipt.gasUsed);
        } else {
          const res = await IDOLContract.returnLockedPool(poolIDs, {
            from: accounts[accountIndex],
          });
          console.log("gasUsed:", res.receipt.gasUsed);
        }

        const afterBalance = toIDOLAmount(
          await IDOLContract.balanceOf(accounts[accountIndex])
        );

        const actualDiff = afterBalance.minus(beforeBalance);

        let totalBackAmount = new BigNumber(0);
        if (isLast && pooledAmountList[accountIndex] !== undefined) {
          for (const {lockedSBTAmount, pooledIDOLAmount} of Object.values(
            pooledAmountList[accountIndex]
          )) {
            // WARNING: calculatedObtainedIDOLAmount may differ from the actual obtained iDOL amount.
            const calculatedObtainedIDOLAmount = pooledIDOLAmount
              .times((1 - LOCK_POOL_BORDER) / LOCK_POOL_BORDER)
              .dp(8);

            const expectedBackAmount = expectedSettledAveragePrice
              .times(lockedSBTAmount)
              .dp(8)
              .minus(calculatedObtainedIDOLAmount);
            const backAmount = expectedBackAmount.lt(0)
              ? new BigNumber(0)
              : expectedBackAmount.gt(pooledIDOLAmount)
              ? pooledIDOLAmount
              : expectedBackAmount;
            console.group(`(account ${accountIndex})`);
            console.log("lockedSBTAmount:   ", lockedSBTAmount.toString(10));
            console.log("pooledIDOLAmount:  ", pooledIDOLAmount.toString(10));
            console.log("expectedBackAmount:", expectedBackAmount.toString(10));
            console.log("backAmount:        ", backAmount.toString(10));
            console.groupEnd();
            totalBackAmount = totalBackAmount.plus(backAmount);
          }
          delete pooledAmountList[accountIndex];
        }

        logger.group(`(account ${accountIndex}) TotalBackAmount`);
        logger.log("expected:", totalBackAmount.toString(10));
        logger.group("actual:  ", actualDiff.toString(10));
        logger.log("  ", beforeBalance.toString(10));
        logger.log("->", afterBalance.toString(10));
        logger.groupEnd();
        logger.groupEnd();

        if (Object.values(isInvalidMyLowestPriceList).some((v) => v)) {
          logger.log(
            `Someone inputted an invalid makeAuctionResult parameter.`,
            "So the back iDOL amount may be less than expected."
          );
          assert.ok(
            actualDiff.minus(totalBackAmount).lt(1e-5),
            `(account ${accountIndex}) ` +
              "the back amount is differ from expected (the detailed log is in the summary)"
          );
        } else {
          assert.ok(
            actualDiff.minus(totalBackAmount).abs().lt(1e-5),
            `(account ${accountIndex}) ` +
              "the back amount is differ from expected (the detailed log is in the summary)"
          );
        }
      }

      if (useWrapper) {
        logger.log(await balanceLogger(`after returnLockedPoolUsers`, bondIDs));
      } else {
        logger.log(await balanceLogger(`after returnLockedPool`, bondIDs));
      }

      const totalIDOLSupply = await IDOLContract.totalSupply();
      const totalLockedSBTValue = await IDOLContract.solidValueTotal();
      const actualLambda = await IDOLContract.calcSBT2IDOL(10 ** 12);
      const expectedLambda = lambdaSimulator.calcUSD2IDOL(1);
      logger.log(
        "total iDOL supply     (iDOL):",
        toIDOLAmount(totalIDOLSupply).toFixed(8)
      );
      logger.log(
        "total locked SBT value (USD):",
        toBTValue(totalLockedSBTValue).toFixed(12)
      );
      logger.log(
        "lambda            (iDOL/USD):",
        toIDOLAmount(actualLambda).toFixed(8)
      );
      logger.log("expected lambda", expectedLambda.toString(10));

      if (Object.values(isInvalidMyLowestPriceList).some((v) => v)) {
        logger.log(
          "Someone inputted an invalid makeAuctionResult parameter.",
          "So the lambda value may be less than expected."
        );
        assert.ok(
          toIDOLAmount(actualLambda).minus(expectedLambda).lt(1e-6),
          `the lambda value differs from expected (the detailed log is in the summary)`
        );
        // Overwrite the actual lambda value.
        lambdaSimulator.totalIDOLSupply = toIDOLAmount(totalIDOLSupply);
        lambdaSimulator.totalLockedSBTValue = toBTValue(totalLockedSBTValue);
      } else {
        assert.ok(
          toIDOLAmount(actualLambda).minus(expectedLambda).abs().lt(1e-6),
          `the lambda value differs from expected (the detailed log is in the summary)`
        );
      }
    }

    if (errorMessage !== "") {
      assert.fail("should fail to execute this test");
    }
  };

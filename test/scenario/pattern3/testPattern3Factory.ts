import BigNumber from "bignumber.js";

import {
  Pattern3TestCase,
  convertToAuctionInfoIDOL,
  splitBids,
  getBidPriceLimit,
  NO_LOWEST_LOSE_BID_PRICE,
  GIVE_UP_TO_MAKE_AUCTION_RESULT,
} from "./utils";
import {
  getBidStatus,
  getWinAmount,
  getBoard,
  discretizeBidPrice,
} from "./generateRandomCase";
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
} from "../../constants";
import {
  callRegisterNewBondGroup,
  callGetBond,
} from "../../bondmaker/callFunction";
import {
  callCloseAuction,
  callMakeAuctionResult,
  callMakeEndInfo,
  callGetTimeFlag,
} from "../../auction/callFunction";
import {callRevealBids} from "../../auctionBoard/callFunction";
import {callIssueLBTAndIDOL} from "../../wrapper/callFunction";
import {callMintIDOL} from "../../stablecoin/callFunction";
import {balanceLoggerFactory} from "./pat3Logger";
import Pattern3LambdaSimulator from "./theory/lambdaSimulator";

BigNumber.set({ROUNDING_MODE: BigNumber.ROUND_DOWN});

const LOCK_POOL_BORDER = 0.1;

const TestOracle = artifacts.require("TestOracle");
const StableCoin = artifacts.require("StableCoin");
const BondMaker = artifacts.require("BondMaker");
const Auction = artifacts.require("Auction");
const AuctionBoard = artifacts.require("AuctionBoard");
const BondToken = artifacts.require("BondToken");
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

      logger.log(`## BondGroup${bondGroupIndex}\n`);

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
            const {upperBidPriceLimit, lowerBidPriceLimit} = getBidPriceLimit(
              strikePriceIDOL,
              auctionRestartedCount
            );
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

      // Register SBT and LBT.
      const now = await getBlockTimestampSec();
      let maturity: number;
      {
        const beforeRegisteringBonds = etherStatus?.beforeRegisteringBonds;
        const {rateETH2USD, volatility, untilMaturity} = {
          rateETH2USD: beforeRegisteringBonds?.rateETH2USD ?? 200,
          volatility: beforeRegisteringBonds?.volatility ?? 0,
          untilMaturity:
            beforeRegisteringBonds?.untilMaturity ?? auctionSpan + days,
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

        let balanceDiff: BigNumber[];
        try {
          balanceDiff = await getBalanceDiff(async () => {
            let poolID: string;
            // Each account issues iDOL by locking SBT.
            if (useWrapper) {
              await bondMakerContract.issueNewBonds(bondGroupID, {
                from: accounts[accountIndex],
                value: fromEtherAmount(
                  mintAmount.minus(lockAmount).times(1002).div(1000)
                ),
              });
              const wrapperContract = await Wrapper.at(
                contractAddresses.wrapper
              );
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
        } catch (err) {
          assert.equal(
            err.message,
            errorMessage,
            "fail to execute mint (iDOL)"
          );
          return;
        }

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

      console.log(`after mint (iDOL)`);

      console.log(`\n## BondGroup${bondGroupIndex} Trigger0\n`);
      logger.log(`### BondGroup${bondGroupIndex} Trigger0\n`);

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
          logger.log("The SBT is in emergency.");
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

          logger.log("The SBT is in the auction span.");
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
      let boardSizeLimitFlag = false;
      for (
        let auctionIndex = 0;
        auctionIndex < auctions.length;
        auctionIndex++
      ) {
        console.log(
          `\n## BondGroup${bondGroupIndex} Trigger0 Auction${auctionIndex}\n`
        );
        logger.log(
          `#### BondGroup${bondGroupIndex} Trigger0 Auction${auctionIndex}\n`
        );

        if (
          isLast &&
          errorMessage ===
            "there is no auction amount, but the bids of auction is given"
        ) {
          logger.log(
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
            isDelegated: boolean;
          };
        } = {};

        console.log("\n## exec bid:\n");
        // Each account will place a buy order as per the test case.
        console.log(
          "strike price:",
          new BigNumber(solidStrikePrice).toFixed(4)
        );

        {
          const timeControlFlag = await callGetTimeFlag(
            auctionContract,
            auctionID
          );
          console.log(
            "timeControlFlag",
            timeControlFlag,
            timeControlFlag === "ACCEPTING_BIDS_PERIOD"
          );
        }

        const strikePriceIDOL = toIDOLAmount(
          await IDOLContract.calcSBT2IDOL(
            new BigNumber(solidStrikePrice).dp(4).shiftedBy(12).toString(10)
          )
        );
        const {upperBidPriceLimit} = getBidPriceLimit(
          strikePriceIDOL,
          auctionIndex
        );
        async function bidWithMemo(
          bid: {
            accountIndex: number;
            bidInfoList: string[];
            totalTargetSBTAmount: BigNumber.Value;
            random?: BigNumber.Value;
            early?: boolean;
            unrevealed?: boolean;
            isDelegated?: boolean;
          },
          bidIndex: number
        ) {
          const {
            accountIndex,
            bidInfoList,
            totalTargetSBTAmount,
            random,
            early,
            unrevealed,
            isDelegated,
          } = bid;
          const secret = await auctionBoardContract.generateMultiSecret(
            auctionID,
            bidInfoList,
            new BigNumber(random || bidIndex).dp(0).toString(10)
          );

          const totalIDOLAmount = new BigNumber(upperBidPriceLimit).times(
            totalTargetSBTAmount
          );

          await IDOLContract.approve(
            contractAddresses.auctionBoard,
            fromIDOLAmount(totalIDOLAmount.dp(8, BigNumber.ROUND_UP)),
            {
              from: accounts[accountIndex],
            }
          );
          const allowance = await IDOLContract.allowance(
            accounts[accountIndex],
            contractAddresses.auctionBoard
          );
          console.group(`(account ${accountIndex})`);
          console.log("allowance", toIDOLAmount(allowance).toString());
          console.log(
            `target SBT amount:         `,
            new BigNumber(totalTargetSBTAmount).toFixed(8)
          );

          const depositedIDOLAmount = await auctionBoardContract.bidWithMemo.call(
            auctionID,
            secret,
            fromBTAmount(totalTargetSBTAmount),
            encodeUtf8(""),
            {
              from: accounts[accountIndex],
            }
          );
          console.log(
            "totalIDOLAmount",
            fromIDOLAmount(totalIDOLAmount.dp(8, BigNumber.ROUND_UP)),
            depositedIDOLAmount.toString()
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
              fromBTAmount(totalTargetSBTAmount),
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
            const output = `fail to execute bid`;
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
                bidInfoList,
                new BigNumber(random || bidIndex).dp(0).toString(10),
                {
                  from: accounts[0],
                }
              );
            } catch (err) {
              if (
                err.message ===
                "Returned error: VM Exception while processing transaction: revert the total SBT amount info needs to be the same with that of secret. -- Reason given: the total SBT amount info needs to be the same with that of secret.."
              ) {
                console.warn(
                  "expected error: fail to reveal bids because of invalid total target SBT amount"
                );
                secrets[secret] = {
                  accountIndex: accountIndex,
                  auctionID,
                  bids: bidInfoList,
                  random: new BigNumber(random || bidIndex).dp(0).toString(10),
                  unrevealed: unrevealed === true,
                  isDelegated: isDelegated === true,
                };
                return;
              }

              throw err;
            }
          } else {
            secrets[secret] = {
              accountIndex: accountIndex,
              auctionID,
              bids: bidInfoList,
              random: new BigNumber(random || bidIndex).dp(0).toString(10),
              unrevealed: unrevealed === true,
              isDelegated: isDelegated === true,
            };
          }
        }

        for (const [
          bidIndex,
          {
            accountIndex,
            bidInfoList,
            price,
            amount: totalTargetSBTAmount,
            random,
            early,
            unrevealed,
            isDelegated,
          },
        ] of bids.entries()) {
          if (price !== undefined) {
            await bidWithMemo(
              {
                accountIndex,
                bidInfoList: [
                  fromIDOLAmount(price),
                  fromBTAmount(totalTargetSBTAmount),
                ],
                totalTargetSBTAmount,
                random,
                early,
                unrevealed,
                isDelegated,
              },
              bidIndex
            );
          } else if (bidInfoList !== undefined) {
            // const totalTargetSBTAmount = bidInfoList.reduce(
            //     (acc, { amount }) => acc.plus(amount),
            //     new BigNumber(0)
            // );
            await bidWithMemo(
              {
                accountIndex,
                bidInfoList: bidInfoList.reduce(
                  (acc, {price, amount}) => [
                    ...acc,
                    fromIDOLAmount(price),
                    fromBTAmount(amount),
                  ],
                  new Array<string>()
                ),
                totalTargetSBTAmount,
                random,
                early,
                unrevealed,
                isDelegated,
              },
              bidIndex
            );
          } else {
            throw new Error("the bids format is invalid");
          }
        }

        logger.log(`after bid`);
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
        {
          const timeControlFlag = await callGetTimeFlag(
            auctionContract,
            auctionID
          );
          console.log(
            "timeControlFlag",
            timeControlFlag,
            timeControlFlag === "REVEAL_BIDS_PERIOD"
          );
        }

        for (const [
          secret,
          {accountIndex, bids, random, unrevealed, isDelegated},
        ] of Object.entries(secrets)) {
          // console.log(`account ${accountIndex}: ${accounts[accountIndex]}`);
          if (unrevealed) {
            continue;
          }

          let revealedBids: {
            bidPrice: string;
            boardIndex: number;
          }[];
          try {
            revealedBids = await callRevealBids(
              auctionBoardContract,
              auctionID,
              bids,
              random,
              {
                from: isDelegated ? accounts[0] : accounts[accountIndex],
              }
            );
          } catch (err) {
            if (
              err.message ===
              "Returned error: VM Exception while processing transaction: revert the total SBT amount info needs to be the same with that of secret. -- Reason given: the total SBT amount info needs to be the same with that of secret.."
            ) {
              console.warn(
                "expected error: fail to reveal bids because of invalid total target SBT amount"
              );
              continue;
            }

            if (
              err.message ===
              "Returned error: VM Exception while processing transaction: revert too many bids -- Reason given: too many bids."
            ) {
              console.log("expected error:", err.message);
              boardSizeLimitFlag = true;
              continue;
            }

            assert.equal(
              err.message,
              errorMessage,
              "fail to execute revealBids"
            );
            return;
          }

          delete secrets[secret];

          console.group(`(account ${accountIndex})`);
          console.log("revealedBids:", revealedBids);
          console.groupEnd();
        }
        logger.log(`after revealBid`);

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

        if (giveUpSortBidPrice) {
          if (isEmergency) {
            await advanceTime(emergencyAuctionWithdrawSpan);
          } else {
            await advanceTime(auctionWithdrawSpan);
          }
          await mineOneBlock();
        }

        console.log("sort bid price");
        {
          const res = await auctionBoardContract.sortBidPrice(
            auctionID,
            sortedPrice,
            {
              from: accounts[0],
            }
          );
          console.log("gasUsed:", res.receipt.gasUsed);
        }

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
        }

        // Decide auction winners by endAuction.

        if (!giveUpSortBidPrice && giveUpMakeEndInfo) {
          if (isEmergency) {
            await advanceTime(emergencyAuctionWithdrawSpan);
          } else {
            await advanceTime(auctionWithdrawSpan);
          }
          await mineOneBlock();
        }

        {
          console.log("\n## exec makeEndInfo\n");
          logger.log("\nexec makeEndInfo\n");
          const timeControlFlag = await callGetTimeFlag(
            auctionContract,
            auctionID
          );
          console.log(
            "timeControlFlag",
            timeControlFlag,
            timeControlFlag === "RECEIVING_SBT_PERIOD"
          );
          const {settledAmount, paidIDOL, rewardedSBT} = await callMakeEndInfo(
            auctionBoardContract,
            auctionID
          );
          logger.log("auction info diff:");
          logger.log("    settledAmount:", settledAmount.toString());
          logger.log("    paidIDOL:     ", paidIDOL.toString());
          logger.log("    rewardedSBT:  ", rewardedSBT.toString());
        }

        {
          const auctionDisposalInfo = await auctionBoardContract.auctionDisposalInfo(
            auctionID
          );
          const strikePriceIDOLForUnrevealed = toIDOLAmount(
            auctionDisposalInfo[0]
          );
          const strikePriceIDOLForRestWinners = toIDOLAmount(
            auctionDisposalInfo[1]
          );
          const isEndInfoCreated = auctionDisposalInfo[2];
          logger.log(
            "strikePriceIDOLForUnrevealed:",
            strikePriceIDOLForUnrevealed.toFixed(8)
          );
          logger.log(
            "strikePriceIDOLForRestWinners:",
            strikePriceIDOLForRestWinners.toFixed(8)
          );
          logger.log("isEndInfoCreated:", isEndInfoCreated);

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

            const bidsSplit = splitBids(bids);
            for (const {accountIndex: bidder, price, early, unrevealed} of [
              ...bidsSplit.filter(({early}) => early === true),
              ...bidsSplit.filter(({early}) => early !== true),
            ]) {
              if (unrevealed) {
                continue;
              }
              const bidPrice = early
                ? discretizeBidPrice(upperBidPriceLimit)
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
                if (isWinBid && !(giveUpSortBidPrice || giveUpMakeEndInfo)) {
                  actualMyWinBids.push({
                    price: bidPrice,
                    boardIndex: boardIndex,
                  });
                }
                if (isLoseBid || giveUpSortBidPrice || giveUpMakeEndInfo) {
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

        logger.log(`before makeAuctionResult`);

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
        logger.log(`calcBillAndCheckLoserBids\n`);
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
              myLowestPrice === NO_LOWEST_LOSE_BID_PRICE
                ? new BigNumber(2).pow(64).minus(1).toString(10)
                : myLowestPrice === GIVE_UP_TO_MAKE_AUCTION_RESULT
                ? new BigNumber(2).pow(64).minus(2).toString(10)
                : fromIDOLAmount(myLowestPrice);
            logger.group("my lowest price:", actualMyLowestPrice.toString());
            logger.log("actual:", actualMyLowestPrice.toString());
            logger.log("input: ", expectedMyLowestPrice);
            logger.groupEnd();
            logger.groupEnd();
            if (
              actualMyLowestPrice.toString() !== expectedMyLowestPrice &&
              myLowestPrice !== GIVE_UP_TO_MAKE_AUCTION_RESULT
            ) {
              if (invalidMyLowestPrice) {
                isInvalidMyLowestPriceFlag = true;
              } else {
                assert.fail(
                  `(account ${accountIndex}) ` +
                    "must not input invalid bid results without invalidMyLowestPrice flag in the test case"
                );
              }
            }
          } catch (err) {
            /* assert.equal(
                            err.message,
                            errorMessage,
                            'fail to execute calcMyLowestPrice'
                        ); */
          }

          try {
            await auctionContract.calcBillAndCheckLoserBids(
              auctionID,
              accounts[accountIndex],
              fromBTAmount(winnerAmountMap.get(accountIndex) || 0),
              giveUpSortBidPrice ||
                giveUpMakeEndInfo ||
                myLowestPrice === GIVE_UP_TO_MAKE_AUCTION_RESULT
                ? new BigNumber(2).pow(64).minus(2).toString(10)
                : myLowestPrice === NO_LOWEST_LOSE_BID_PRICE
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

        logger.log(`after calcBillAndCheckLoserBids`);

        if (isReceivingWinBidsLately) {
          if (isEmergency) {
            await advanceTime(emergencyAuctionWithdrawSpan);
          } else {
            await advanceTime(auctionWithdrawSpan);
          }
          await mineOneBlock();

          // console.log(await auctionContract.getTimeControlFlag(auctionID));
          // console.log(await auctionFlag(auctionContract, auctionID));

          logger.log(`before callCloseAuction`);

          console.log("\n## exec callCloseAuction\n");
          {
            const timeControlFlag = await callGetTimeFlag(
              auctionContract,
              auctionID
            );
            console.log(
              "timeControlFlag",
              timeControlFlag,
              timeControlFlag === "AFTER_AUCTION_PERIOD"
            );

            const {isLast: actualIsLast} = await callCloseAuction(
              auctionContract,
              auctionID
            );
            logger.log("isLast:", actualIsLast?.toString());
            isLast = actualIsLast;
          }

          logger.log(await balanceLogger(`after callCloseAuction`, bondIDs));
        }

        async function makeAuctionResult(
          actionEntries: [
            string,
            Pattern3TestCase["bondGroups"][number]["auctions"][number]["actions"][number]
          ][]
        ) {
          const timeControlFlag = await callGetTimeFlag(
            auctionContract,
            auctionID
          );
          console.log(
            "timeControlFlag",
            timeControlFlag,
            timeControlFlag === "AFTER_AUCTION_PERIOD"
          );

          for (const [accountIndex, {result}] of actionEntries) {
            if (result === null) {
              continue;
            }

            const {myLowestPrice, myLoseBids, myWinBids} = result;

            console.log(`(account${accountIndex})`);
            logger.group(`(account${accountIndex})`);

            try {
              const {
                SBTAmountOfReward,
                IDOLAmountOfPayment,
                IDOLAmountOfChange,
              } = await callMakeAuctionResult(
                auctionContract,
                auctionID,
                myLowestPrice === GIVE_UP_TO_MAKE_AUCTION_RESULT
                  ? new BigNumber(2).pow(64).minus(2).toString(10)
                  : myLowestPrice === NO_LOWEST_LOSE_BID_PRICE
                  ? new BigNumber(2).pow(64).minus(1).toString(10)
                  : fromIDOLAmount(myLowestPrice),
                fromBids(myWinBids),
                fromBids(myLoseBids),
                {
                  from: accounts[accountIndex],
                }
              );

              const {board, settledAmountForUnrevealed} = getBoard(
                strikePriceIDOL,
                splitBids(bids)
              );
              const expectedSBTAmountOfReward = getWinAmount(
                ongoingSBTAmount.minus(settledAmountForUnrevealed),
                board,
                Number(accountIndex)
              );

              logger.group("SBTAmountOfReward:  ");
              logger.log("expected:", expectedSBTAmountOfReward.toString());
              logger.log(
                "actual:  ",
                toBTAmount(SBTAmountOfReward).toString(10)
              );
              logger.groupEnd();
              logger.log(
                "IDOLAmountOfPayment:",
                IDOLAmountOfPayment.toString()
              );
              logger.log("IDOLAmountOfChange: ", IDOLAmountOfChange.toString());
              logger.groupEnd();

              if (!boardSizeLimitFlag) {
                assert.ok(
                  toBTAmount(SBTAmountOfReward).isEqualTo(
                    expectedSBTAmountOfReward
                  ),
                  "rewarded SBT amount is differ from expected"
                );
              }
            } catch (err) {
              if (
                err.message ===
                "Returned error: VM Exception while processing transaction: revert This process is already done -- Reason given: This process is already done."
              ) {
                console.warn("ignored error:", err.message);
                continue;
              }

              throw err;
            }
          }
        }

        console.log("\n## exec makeAuctionResult\n");
        try {
          await makeAuctionResult(
            Object.entries(actions).filter(
              ([, {isMakingAuctionResultLately}]) =>
                isMakingAuctionResultLately !== true
            )
          );
        } catch (err) {
          assert.equal(
            err.message,
            errorMessage,
            `fail to execute makeAuctionResult`
          );
          return;
        }

        if (!isReceivingWinBidsLately) {
          if (isEmergency) {
            await advanceTime(emergencyAuctionWithdrawSpan);
          } else {
            await advanceTime(auctionWithdrawSpan);
          }
          await mineOneBlock();
        }

        console.log("\n## exec makeAuctionResult lately\n");
        try {
          await makeAuctionResult(
            Object.entries(actions).filter(
              ([, {isMakingAuctionResultLately}]) =>
                isMakingAuctionResultLately === true
            )
          );
        } catch (err) {
          assert.equal(
            err.message,
            errorMessage,
            `fail to execute makeAuctionResult lately`
          );
          return;
        }

        logger.log(`after makeAuctionResult`);

        if (!isReceivingWinBidsLately) {
          if (isEmergency) {
            await advanceTime(emergencyAuctionWithdrawSpan);
          } else {
            await advanceTime(auctionWithdrawSpan);
          }
          await mineOneBlock();

          // console.log(await auctionContract.getTimeControlFlag(auctionID));
          // console.log(await auctionFlag(auctionContract, auctionID));

          logger.log(`before callCloseAuction`);

          console.log("\n## exec callCloseAuction\n");
          {
            const timeControlFlag = await callGetTimeFlag(
              auctionContract,
              auctionID
            );
            console.log(
              "timeControlFlag",
              timeControlFlag,
              timeControlFlag === "AFTER_AUCTION_PERIOD"
            );

            const {isLast: actualIsLast} = await callCloseAuction(
              auctionContract,
              auctionID
            );
            logger.log("isLast:", actualIsLast?.toString());
            isLast = actualIsLast;

            const {lowerBidPriceLimit} = getBidPriceLimit(
              strikePriceIDOL,
              auctionIndex
            );
            console.log("lowerBidPriceLimit", lowerBidPriceLimit);

            const auctionTriggerCount = await IDOLContract.auctionTriggerCount(
              solidBondID
            );
            const poolID = await IDOLContract.generatePoolID(
              solidBondID,
              auctionTriggerCount.toNumber() - 1
            );

            const logs = await IDOLContract.contract.getPastEvents(
              "LogLambda",
              {
                filter: {poolID},
              }
            );
            logs.map(({event, transactionHash, returnValues}) => {
              const {
                poolID,
                settledAverageAuctionPrice,
                // totalSupply,
                // lockedSBTValue,
              } = returnValues;
              console.log("poolID", poolID);
              console.log(
                "actual settledAverageAuctionPrice",
                toIDOLAmount(settledAverageAuctionPrice).toString(10)
              );
              if (isLast) {
                assert.ok(
                  toIDOLAmount(settledAverageAuctionPrice).gte(
                    lowerBidPriceLimit
                  ),
                  "unexpected the average settled price"
                );
              }
            });
          }

          logger.log(`after callCloseAuction`);
        }
      }

      if (errorMessage === "isLast differ from expected") {
        console.log("expected error: isLast differ from expected");
        return;
      }
      assert.equal(isLast, expectedIsLast, "isLast differ from expected");

      const checkTheoreticalValue = !boardSizeLimitFlag;

      console.log("\n## returnLockedPool\n");
      logger.log("returnLockedPool\n");

      const expectedSettledAveragePrice = totalUnlockedSBT.eq(0)
        ? new BigNumber(0)
        : totalBurnedIDOL.div(totalUnlockedSBT).dp(8);
      logger.log(
        "expectedTotalBurnedIDOL (iDOL):        ",
        totalBurnedIDOL.toFixed(8)
      );
      logger.log(
        "expectedTotalUnlockedSBT (SBT):        ",
        totalUnlockedSBT.toFixed(8)
      );
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
          const poolInfo = await IDOLContract.getPoolInfo(poolID);
          const actualSoldSBTTotalInAuction = poolInfo[4];
          const actualPaidIDOLTotalInAuction = poolInfo[5];
          const actualSettledAveragePrice = poolInfo[6];
          logger.log(`pool ID ${poolID.slice(0, 7)}...`);
          logger.log(
            "actualTotalBurnedIDOL (iDOL):        ",
            toIDOLAmount(actualPaidIDOLTotalInAuction).toFixed(8)
          );
          logger.log(
            "actualTotalUnlockedSBT (SBT):        ",
            toBTAmount(actualSoldSBTTotalInAuction).toFixed(8)
          );
          logger.log(
            "actualSettledAveragePrice (iDOL/SBT):",
            toIDOLAmount(actualSettledAveragePrice).toFixed(8)
          );
        }

        const res = await IDOLContract.returnLockedPool(poolIDs, {
          from: accounts[accountIndex],
        });
        console.log("gasUsed:", res.receipt.gasUsed);

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

        try {
          if (isInvalidMyLowestPriceFlag) {
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
            console.log("check theoretical price");
            assert.ok(
              actualDiff.minus(totalBackAmount).abs().lt(1e-5),
              `(account ${accountIndex}) ` +
                "the back amount is differ from expected (the detailed log is in the summary)"
            );
          }
        } catch (err) {
          if (!checkTheoreticalValue) {
            console.warn("ignored error:", err.message);
            continue;
          }

          throw err;
        }
      }

      logger.log(`after returnLockedPool`);

      const totalIDOLSupply = await IDOLContract.totalSupply();
      const totalLockedSBTValue = await IDOLContract.solidValueTotal();
      const actualLambda = await IDOLContract.calcSBT2IDOL(10 ** 12);
      const expectedTotalIDOLSupply = lambdaSimulator.totalIDOLSupply;
      const expectedTotalLockedSBTValue = lambdaSimulator.totalLockedSBTValue;
      const expectedLambda = lambdaSimulator.calcUSD2IDOL(1);
      logger.group("actual:");
      logger.log(
        "total iDOL supply (iDOL)    :",
        toIDOLAmount(totalIDOLSupply).toFixed(8)
      );
      logger.log(
        "total locked SBT value (USD):",
        toBTValue(totalLockedSBTValue).toFixed(12)
      );
      logger.log(
        "lambda (iDOL/USD)           :",
        toIDOLAmount(actualLambda).toFixed(8)
      );
      logger.groupEnd();
      logger.group("expected:");
      logger.log(
        "total iDOL supply (iDOL)    :",
        expectedTotalIDOLSupply.toFixed(8)
      );
      logger.log(
        "total locked SBT value (USD):",
        expectedTotalLockedSBTValue.toFixed(12)
      );
      logger.log("lambda (iDOL/USD)           :", expectedLambda.toString(10));
      logger.groupEnd();

      try {
        if (isInvalidMyLowestPriceFlag) {
          logger.log(
            "Someone inputted an invalid makeAuctionResult parameter.",
            "So the lambda value may be less than expected."
          );
          assert.ok(
            toIDOLAmount(actualLambda).minus(expectedLambda).lt(1e-6),
            `the lambda value differs from expected (the detailed log is in the summary)`
          );
        } else {
          console.log("check theoretical price");
          assert.ok(
            toIDOLAmount(actualLambda).minus(expectedLambda).abs().lt(1e-6),
            `the lambda value differs from expected (the detailed log is in the summary)`
          );
        }
      } catch (err) {
        if (!checkTheoreticalValue) {
          console.warn("ignored error:", err.message);
          continue;
        }

        throw err;
      }

      // Overwrite the actual lambda value.
      lambdaSimulator.totalIDOLSupply = toIDOLAmount(totalIDOLSupply);
      lambdaSimulator.totalLockedSBTValue = toBTValue(totalLockedSBTValue);
    }

    if (errorMessage !== "") {
      assert.fail("should fail to execute this test");
    }
  };

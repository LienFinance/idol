import {BigNumber} from "bignumber.js";

import {pat2cases} from "./testCases";
import {
  advanceTime,
  mineOneBlock,
  getBlockTimestampSec,
  fromBTAmount,
  fromIDOLAmount,
  toEtherAmount,
  diff,
} from "../../util";
import {
  callRegisterNewBond,
  callRegisterNewBondGroup,
} from "../../bondmaker/callFunction";
import {callBurn} from "../../bondToken/callFunction";
import {init} from "../../init";
import Web3 from "web3";

declare const web3: Web3;

const defaultEtherStatus = {rateETH2USD: 200, volatility: 0};

const Oracle = artifacts.require("TestOracle");
const BondMaker = artifacts.require("TestBondMaker");
const StableCoin = artifacts.require("TestStableCoin");
const Auction = artifacts.require("TestAuction");
const AuctionBoard = artifacts.require("TestAuctionBoard");
const BondToken = artifacts.require("TestBondToken");

contract("scenario", (accounts) => {
  let contractAddresses: {
    oracle: string;
    bondMaker: string;
    idol: string;
  };

  before(async () => {
    contractAddresses = await init(
      BondMaker,
      StableCoin,
      Auction,
      AuctionBoard
    );
  });

  describe("pattern 2", () => {
    pat2cases.forEach(
      (
        {errorMessage, etherStatus, bondGroups, liquidationSchedules},
        caseIndex
      ) => {
        it(`case ${caseIndex}`, async () => {
          const now = await getBlockTimestampSec();
          // prepare bond maker contract
          const bondMakerContract = await BondMaker.at(
            contractAddresses.bondMaker
          );
          const IDOLContract = await StableCoin.at(contractAddresses.idol);
          const oracleContract = await Oracle.at(contractAddresses.oracle);

          {
            const {rateETH2USD, volatility} =
              etherStatus.beforeRegisteringBonds ?? defaultEtherStatus;

            await oracleContract.testSetOracleData(
              new BigNumber(rateETH2USD).shiftedBy(8).toString(10),
              new BigNumber(volatility).shiftedBy(8).toString(10)
            );
          }

          const bondGroupInfoList = new Array<{
            bondGroupID: string;
            bondInfoList: {
              bondID: string;
              address: string;
              price: BigNumber;
            }[];
          }>();
          for (const {
            periodSecBeforeMaturity,
            bonds,
            issuingBondAmount,
            lockingSBTAmount,
            unlockingIDOLAmount,
          } of bondGroups) {
            const maturity = now + periodSecBeforeMaturity;

            // Register SBT and LBT.
            const bondInfoList = new Array<
              typeof bondGroupInfoList[number]["bondInfoList"][number]
            >();
            for (const {fnMap, price} of bonds) {
              const {
                bondID: newBondID,
                bondTokenAddress,
              } = await callRegisterNewBond(bondMakerContract, maturity, fnMap);

              bondInfoList.push({
                bondID: newBondID,
                address: bondTokenAddress,
                price: new BigNumber(price),
              });
            }

            // Register bond group contains registered SBT and LBT.
            const solidBond = bondInfoList[0];
            const {bondGroupID} = await callRegisterNewBondGroup(
              bondMakerContract,
              bondInfoList.map((bond) => bond.bondID),
              maturity
            );

            bondGroupInfoList.push({
              bondGroupID,
              bondInfoList,
            });

            // Issue bond group registered.
            {
              const getBalanceDiff = diff(async () => {
                const balance = await web3.eth.getBalance(
                  bondMakerContract.address
                );
                return toEtherAmount(balance);
              });
              const balanceDiff = await getBalanceDiff(async () => {
                console.log(
                  "issuingBondAmount",
                  issuingBondAmount.toString(10)
                );

                const paidETHAmount = new BigNumber(issuingBondAmount)
                  .shiftedBy(18)
                  .times(1002)
                  .div(1000)
                  .toString(10);

                await bondMakerContract.issueNewBonds(bondGroupID, {
                  value: paidETHAmount,
                });
              });
              assert.equal(
                balanceDiff.toString(10),
                issuingBondAmount.toString(10),
                "invalid balance"
              );
            }

            // Issue iDOL by locking SBT.
            if (lockingSBTAmount.toString() !== "0") {
              const bondTokenInstance = await BondToken.at(solidBond.address);
              await bondTokenInstance.increaseAllowance(
                contractAddresses.idol,
                fromBTAmount(lockingSBTAmount)
              );
              await IDOLContract.mint(
                solidBond.bondID,
                accounts[0],
                fromBTAmount(lockingSBTAmount)
              );
              const IDOLBalance = await IDOLContract.balanceOf(accounts[0]);
              console.log(`IDOL after mint: $${IDOLBalance.toString()}`);
            }

            // Burn iDOL and unlock SBT locked.
            if (unlockingIDOLAmount.toString() !== "0") {
              await IDOLContract.unlockSBT(
                solidBond.bondID,
                fromIDOLAmount(unlockingIDOLAmount)
              );
              const IDOLBalance = await IDOLContract.balanceOf(accounts[0]);
              console.log(`IDOL after unlockSBT: $${IDOLBalance.toString()}`);
            }
          }

          let advancedTime = 0;

          for (const schedule of liquidationSchedules) {
            if (schedule.type === "advanceTime") {
              const {
                advancedTime: periodSecBeforeLiquidation,
                rateETH2USD,
                volatility,
              } = schedule.data;

              // Advance time until maturity and liquidate SBT and LBT.
              await advanceTime(periodSecBeforeLiquidation - advancedTime);
              await mineOneBlock();
              advancedTime = periodSecBeforeLiquidation;

              await oracleContract.testSetOracleData(
                new BigNumber(rateETH2USD).shiftedBy(8).toString(10),
                new BigNumber(volatility).shiftedBy(8).toString(10)
              );
            } else if (schedule.type === "liquidateBond") {
              const {bondGroupIndex, redeemedEtherAmount} = schedule.data;
              const {bondGroupID, bondInfoList} = bondGroupInfoList[
                bondGroupIndex
              ];

              try {
                await bondMakerContract.liquidateBond(bondGroupID, 0);
              } catch (err) {
                console.log(err.message);
              }

              // Check ETH return amount.
              for (
                let bondIndex = 0;
                bondIndex < bondInfoList.length;
                bondIndex++
              ) {
                const bondTokenInstance = await BondToken.at(
                  bondInfoList[bondIndex].address
                );
                const SBTBalance = await bondTokenInstance.balanceOf(
                  accounts[0]
                );
                const rate = await bondTokenInstance.getRate();
                console.log("SBTBalance", SBTBalance.toString());
                console.log(
                  "rate from BT to ETH",
                  new BigNumber(rate[0].toString())
                    .div(rate[1].toString())
                    .toString(10)
                );

                const {value} = await callBurn(bondTokenInstance, SBTBalance);

                assert.equal(
                  value.toString(10),
                  new BigNumber(redeemedEtherAmount[bondIndex]).toString(10),
                  "invalid bond price"
                );
              }
            }
          }
        });
      }
    );
  });
});

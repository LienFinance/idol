import {BigNumber} from "bignumber.js";

import {pat1cases} from "./testCases";
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
    auction: string;
  };

  before(async () => {
    contractAddresses = await init(
      BondMaker,
      StableCoin,
      Auction,
      AuctionBoard
    );
  });

  describe("pattern 1", () => {
    pat1cases.forEach((caseValue, caseIndex) => {
      it(`case ${caseIndex}`, async () => {
        const now = await getBlockTimestampSec();

        const {
          errorMessage,
          bonds,
          issuingBondAmount,
          lockingSBTAmount,
          unlockingIDOLAmount,
          periodSecBeforeLock,
          periodSecBeforeUnlock,
          periodSecBeforeLiquidation,
          periodSecBeforeMaturity,
          rateETH2USD,
          volatility,
          oracleHintId,
        } = caseValue;
        try {
          // prepare bond maker contract
          const bondMakerContract = await BondMaker.at(
            contractAddresses.bondMaker
          );
          const IDOLContract = await StableCoin.at(contractAddresses.idol);
          const oracleContract = await Oracle.at(contractAddresses.oracle);
          await oracleContract.testSetOracleData(
            new BigNumber(rateETH2USD).shiftedBy(8).toString(10),
            new BigNumber(volatility).shiftedBy(8).toString(10)
          );

          const maturity = now + periodSecBeforeMaturity;

          // Register SBT and LBT.
          let bondsInfo = new Array<{
            bondID: string;
            address: string;
          }>();
          for (const {fnMap} of bonds) {
            const {
              bondID: newBondID,
              bondTokenAddress,
            } = await callRegisterNewBond(bondMakerContract, maturity, fnMap);

            bondsInfo.push({
              bondID: newBondID,
              address: bondTokenAddress,
            });
          }

          // Register bond group contains registered SBT and LBT.
          const solidBond = bondsInfo[0];
          const {bondGroupID} = await callRegisterNewBondGroup(
            bondMakerContract,
            bondsInfo.map((bond) => bond.bondID),
            maturity
          );

          // Issue bond group registered.
          {
            const getBalanceDiff = diff(async () => {
              const balance = await web3.eth.getBalance(
                bondMakerContract.address
              );
              return toEtherAmount(balance);
            });
            const balanceDiff = await getBalanceDiff(async () => {
              console.log("issuingBondAmount", issuingBondAmount.toString(10));

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

          await advanceTime(periodSecBeforeLock);
          await mineOneBlock();

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

          await advanceTime(periodSecBeforeUnlock - periodSecBeforeLock);
          await mineOneBlock();

          // Burn iDOL and unlock SBT locked.
          if (unlockingIDOLAmount.toString() !== "0") {
            await IDOLContract.unlockSBT(
              solidBond.bondID,
              fromIDOLAmount(unlockingIDOLAmount)
            );
            const IDOLBalance = await IDOLContract.balanceOf(accounts[0]);
            console.log(`IDOL after unlockSBT: $${IDOLBalance.toString()}`);
          }

          // Advance time until maturity and liquidate SBT and LBT.
          await advanceTime(periodSecBeforeLiquidation - periodSecBeforeUnlock);
          await mineOneBlock();

          await oracleContract.testSetOracleData(
            new BigNumber(rateETH2USD).shiftedBy(8).toString(10),
            new BigNumber(volatility).shiftedBy(8).toString(10)
          );

          // {
          //     const bondTokenInstance = await BondToken.at(solidBond.address);
          //     const bondContractBalance = await bondTokenInstance.balanceOf(accounts[0]);
          //     await bondTokenInstance.increaseAllowance(
          //         bondMakerContract.address,
          //         bondContractBalance
          //     );
          // }

          if (oracleHintId === ">latestId") {
            const latestId = await oracleContract.latestId.call();
            await bondMakerContract.liquidateBond(
              bondGroupID,
              Number(latestId.toString()) + 1
            );
          } else {
            await bondMakerContract.liquidateBond(
              bondGroupID,
              oracleHintId ?? 0
            );
          }

          // Check ETH return amount.
          for (let bondIndex = 0; bondIndex < bonds.length; bondIndex++) {
            const bondTokenInstance = await BondToken.at(
              bondsInfo[bondIndex].address
            );
            const SBTBalance = await bondTokenInstance.balanceOf(accounts[0]);
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
              new BigNumber(bonds[bondIndex].price).toString(10),
              "invalid bond price"
            );
          }
        } catch (err) {
          if (err.message !== errorMessage) {
            throw err;
          }
        }
      });
    });
  });
});

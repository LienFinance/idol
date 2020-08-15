import {BigNumber} from "bignumber.js";
import testCases from "../testCases";
import {nullAddress, advanceTime} from "../util";
import {callRegisterNewBond, callRegisterNewBondGroup} from "./callFunction";
import {init} from "../init";

import Web3 from "web3";
declare const web3: Web3;

const BondMaker = artifacts.require("TestBondMaker");
const StableCoin = artifacts.require("TestStableCoin");
const Auction = artifacts.require("TestAuction");
const AuctionBoard = artifacts.require("TestAuctionBoard");
const BondToken = artifacts.require("TestBondToken");

contract("BondMaker", () => {
  let contractAddresses: {
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

  describe("registerNewBondGroup", () => {
    const cases = testCases["BondMaker"]["registerNewBondGroup"];

    cases.map(
      ({errorMessage, bondGroup, bondTypes, bondGroupID}, caseIndex) => {
        it(`case ${caseIndex}`, async () => {
          const bondMakerContract = await BondMaker.at(
            contractAddresses.bondMaker
          );
          let solidBondID: string;
          {
            const {maturity, fnMap} = bondTypes[0];
            const {
              bondID: newBondID,
              bondTokenAddress,
            } = await callRegisterNewBond(bondMakerContract, maturity, fnMap);
            solidBondID = newBondID;
            console.log(await bondMakerContract.getBond(newBondID));
            console.log(bondTokenAddress);
          }
          let liquidBondID: string;
          {
            const {maturity, fnMap} = bondTypes[1];
            const {
              bondID: newBondID,
              bondTokenAddress,
            } = await callRegisterNewBond(bondMakerContract, maturity, fnMap);
            liquidBondID = newBondID;
          }

          try {
            const {
              bondGroupID: actualBondGroupID,
            } = await callRegisterNewBondGroup(
              bondMakerContract,
              [solidBondID, liquidBondID],
              bondGroup.maturity
            );
            // console.log('registerNewBondGroup gas: ', newGroupRes.receipt.gasUsed);

            const actual = actualBondGroupID.toString();
            const expected = bondGroupID;
            assert.equal(actual, expected, "invalid new bond group ID");
          } catch (err) {
            assert.equal(
              err.message,
              errorMessage,
              "fail to execute registerNewBondGroup"
            );
            return;
          }

          const actualBondGroup = await bondMakerContract.getBondGroup(
            bondGroupID
          );
          const actualSolidBondID = actualBondGroup[0][0];
          {
            const actual = actualSolidBondID;
            assert.notEqual(actual, nullAddress, `invalid solid bond ID`);
          }

          const actualLiquidBondID = actualBondGroup[0][1];
          {
            const actual = actualLiquidBondID;
            assert.notEqual(actual, nullAddress, `invalid liquid bond ID`);
          }

          if (errorMessage !== "") {
            assert.fail("did not fail to call registerNewBondGroup");
          }
        });
      }
    );
  });
});

contract("BondMaker", (accounts) => {
  let testBondGroupID = "";
  let testSolidBondTokenAddress = "";
  let testLiquidBondTokenAddress = "";

  let contractAddresses: {
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
    const {bondGroup, bondTypes} = testCases["BondMaker"][
      "registerNewBondGroup"
    ][0];
    const bondMakerContract = await BondMaker.at(contractAddresses.bondMaker);
    let solidBondID: string;
    {
      const {maturity, fnMap} = bondTypes[0];
      const {bondID: newBondID, bondTokenAddress} = await callRegisterNewBond(
        bondMakerContract,
        maturity,
        fnMap
      );
      solidBondID = newBondID;
      testSolidBondTokenAddress = bondTokenAddress;
    }
    let liquidBondID: string;
    {
      const {maturity, fnMap} = bondTypes[1];
      const {bondID: newBondID, bondTokenAddress} = await callRegisterNewBond(
        bondMakerContract,
        maturity,
        fnMap
      );
      liquidBondID = newBondID;
      testLiquidBondTokenAddress = bondTokenAddress;
    }

    const {bondGroupID} = await callRegisterNewBondGroup(
      bondMakerContract,
      [solidBondID, liquidBondID],
      bondGroup.maturity
    );
    testBondGroupID = bondGroupID.toString();
  });

  describe("issueNewBonds", () => {
    const cases = testCases["BondMaker"]["issueNewBonds"];
    cases.forEach(({success, underlyingAmount}, caseIndex) => {
      it(`case ${caseIndex}`, async () => {
        const bondMakerContract = await BondMaker.at(
          contractAddresses.bondMaker
        );

        try {
          await bondMakerContract.issueNewBonds(testBondGroupID, {
            value: new BigNumber(underlyingAmount)
              .shiftedBy(18)
              .times(1002)
              .div(1000)
              .dividedToIntegerBy(1)
              .toString(10),
          });
        } catch (err) {
          if (!success) {
            return;
          }
          throw err;
        }

        if (!success) {
          assert.fail(`did not fail to call issueNewBonds`);
        }

        {
          const instance = await BondToken.at(testSolidBondTokenAddress);
          const actual = await instance.balanceOf(accounts[0]);
          const expected = underlyingAmount;
          assert.equal(
            new BigNumber(actual.toString()).shiftedBy(-8).toString(),
            expected.toString(),
            "minting solid-bond failed"
          );
        }

        {
          const instance = await BondToken.at(testLiquidBondTokenAddress);
          const actual = await instance.balanceOf(accounts[0]);
          const expected = underlyingAmount;
          assert.equal(
            new BigNumber(actual.toString()).shiftedBy(-8).toString(10),
            expected.toString(),
            "minting liquid-bond failed"
          );
        }
      });
    });
  });

  describe("liquidateBond", () => {
    const cases = testCases["BondMaker"]["liquidateBond"];
    cases.forEach(
      (
        {success, bondGroupID, timestampLiquidate, returnedCollaterals, price},
        caseIndex
      ) => {
        it(`case ${caseIndex}`, async () => {
          const bondMakerContract = await BondMaker.at(
            contractAddresses.bondMaker
          );

          await web3.eth.sendTransaction({
            from: accounts[0],
            to: bondMakerContract.address,
            value: web3.utils.toWei("0.1", "ether"),
          });

          await advanceTime(timestampLiquidate);
          try {
            await bondMakerContract.liquidateBond(bondGroupID, 0);
          } catch (err) {
            if (!success) {
              return;
            }
            throw err;
          }

          if (!success) {
            assert.fail(`did not fail to call liquidateBond`);
          }

          // const after = await underlyingTokenContract.balanceOf(accounts[0]);
          // const acutal = new BigNumber(after.toString()).minus(before);
          // assert.equal(acutal.toString(), price);
        });
      }
    );
  });
});

contract("BondMaker", () => {
  let contractAddresses: {
    bondMaker: string;
  };

  before(async () => {
    contractAddresses = await init(
      BondMaker,
      StableCoin,
      Auction,
      AuctionBoard
    );
  });

  describe("testGetFnMapProperties", () => {
    const cases = testCases["BondMaker"]["testGetFnMapProperties"];

    cases.forEach(({fnMap, solidStrikePrice, rateLBTWorthless}, caseIndex) => {
      it(`case ${caseIndex}`, async () => {
        const bondMakerContract = await BondMaker.at(
          contractAddresses.bondMaker
        );
        const {
          "0": actualSolidStrikePrice,
          "1": actualRateLBTWorthless,
        } = await bondMakerContract.testGetFnMapProperties(fnMap);

        assert.equal(
          new BigNumber(actualSolidStrikePrice.toString())
            .shiftedBy(-4)
            .toString(10),
          new BigNumber(solidStrikePrice).toString(10),
          `invalid solid strike price`
        );

        assert.equal(
          new BigNumber(actualRateLBTWorthless.toString())
            .shiftedBy(-4)
            .toString(10),
          new BigNumber(rateLBTWorthless).toString(10),
          `invalid rate LBT worthless`
        );
      });
    });
  });
});

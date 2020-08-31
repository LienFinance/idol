import testCases from "../testCases";
import dotcTestCases from "./testCases";
import {
  callRegisterNewBond,
  callRegisterNewBondGroup,
} from "../bondmaker/callFunction";
import {BigNumber} from "bignumber.js";
import {getBlockTimestampSec, days, advanceTime, mineOneBlock} from "../util";
import {maturityScale} from "../constants";
import {describe} from "mocha";

const DecentralizedOTC = artifacts.require("TestDecentralizedOTC");
const LienToken = artifacts.require("TestLienToken");
const LBTPricing = artifacts.require("LBTPricing");
const ERC20Oracle = artifacts.require("TestERC20Oracle");

const Oracle = artifacts.require("TestOracle");
const BondMaker = artifacts.require("BondMaker");
const BondToken = artifacts.require("BondToken");
const BondTokenName = artifacts.require("BondTokenName");

contract("DecentralizedOTC", (accounts) => {
  const initRateETH2USD = 200;
  const initVolatility = 1;
  let DecentralizedOTCContract;
  let LienTokenContract;
  let testPoolMap;
  let LBTPricingContract;
  let ERC20OracleContract;
  let OracleContract;
  let BondMakerContract;
  let BondTokenContract;
  let txResult;
  let testBondGroupID = "";
  let testSolidBondTokenAddress = "";
  let testSBTID = "";
  let testLiquidBondTokenAddress = "";
  let testLBTID = "";
  let testMaturity: number;
  let testLiquidInstance;
  let testAmount;
  let grantID = 1;
  let endTime;

  before(async () => {
    LienTokenContract = await LienToken.new();
    OracleContract = await Oracle.new(
      initRateETH2USD * 100000000,
      initVolatility * 100000000
    );
    BondMakerContract = await BondMaker.new(
      OracleContract.address,
      LienTokenContract.address,
      BondTokenName.address,
      maturityScale
    );
    LBTPricingContract = await LBTPricing.new();
    ERC20OracleContract = await ERC20Oracle.new();
    DecentralizedOTCContract = await DecentralizedOTC.new(
      BondMakerContract.address,
      OracleContract.address,
      LienTokenContract.address
    );
    BondTokenContract = await BondToken.new("", "");

    const {periodSecBeforeMaturity, SBTfnMap, LBTfnMap} = dotcTestCases[
      "DecentralizedOTC"
    ]["registerBondAndBondGroup"][0];
    const now = await getBlockTimestampSec();
    const maturity = now + periodSecBeforeMaturity;
    testMaturity = maturity;
    let solidBondID: string;
    {
      const {bondID: newBondID, bondTokenAddress} = await callRegisterNewBond(
        BondMakerContract,
        maturity,
        SBTfnMap
      );
      solidBondID = newBondID;
      testSolidBondTokenAddress = bondTokenAddress;
    }
    let liquidBondID: string;
    {
      const {bondID: newBondID, bondTokenAddress} = await callRegisterNewBond(
        BondMakerContract,
        maturity,
        LBTfnMap
      );
      liquidBondID = newBondID;
      testLiquidBondTokenAddress = bondTokenAddress;
    }

    const {bondGroupID} = await callRegisterNewBondGroup(
      BondMakerContract,
      [solidBondID, liquidBondID],
      maturity
    );
    testBondGroupID = bondGroupID.toString();
  });

  describe("setPoolMap", () => {
    it(`case 0`, async () => {
      const nowSec = await getBlockTimestampSec();
      endTime = nowSec + 10 * 365 * days;
      txResult = await DecentralizedOTCContract.setPoolMap(
        LienTokenContract.address,
        0,
        true,
        endTime
      );

      testPoolMap = txResult.logs[0].args.poolID;
      //await DecentralizedOTCContract.LogERC20Pool().on('data', (event) => console.log(event));
    });
  });

  describe("setProvider", () => {
    it(`case 0`, async () => {
      await DecentralizedOTCContract.setProvider(
        testPoolMap,
        ERC20OracleContract.address,
        LBTPricingContract.address
      );
    });
  });

  describe("poolERC20", () => {
    it("3", async () => {
      await LienTokenContract.mint(10000000000);
      await LienTokenContract.approve(
        DecentralizedOTCContract.address,
        10000000000
      );
    });
  });

  describe("issueNewBonds", () => {
    const cases = testCases["BondMaker"]["issueNewBonds"];
    cases.forEach(({success, underlyingAmount}, caseIndex) => {
      if (caseIndex > 0) {
        return;
      }
      it(`case ${caseIndex}`, async () => {
        try {
          await BondMakerContract.issueNewBonds(testBondGroupID, {
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
          const sbtID = (await BondMakerContract.getBondGroup(1)).bondIDs[0];
          console.log("SBT ID", sbtID);
          testSBTID = sbtID;
          testLBTID = (await BondMakerContract.getBondGroup(1)).bondIDs[1];
          const res = await BondMakerContract.getBond(sbtID);
          console.log("solid strike price", res.solidStrikePrice.toString());
          const fnMap = await BondMakerContract.getFnMap(res.fnMapID);
          console.log("fnMap", fnMap);

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
          testLiquidInstance = await BondToken.at(testLiquidBondTokenAddress);
          testAmount = await testLiquidInstance.balanceOf(accounts[0]);
          const expected = underlyingAmount;
          assert.equal(
            new BigNumber(testAmount).shiftedBy(-8).toString(10),
            expected.toString(),
            "minting liquid-bond failed"
          );
        }
      });
    });
  });

  /**
   * @dev The case swapping ERC20 tokens with different decimals can be tested by
   * change decimal LienToken.test.sol locally.
   */
  describe("exchangeLBT2ERC20", () => {
    it(`case 0`, async () => {
      await testLiquidInstance.approve(
        DecentralizedOTCContract.address,
        100000
      );
      // const oracleContract = await Oracle.at(OracleContract.address);
      // await oracleContract.testSetOracleData(
      //     initRateETH2USD * 10000,
      //     initVolatility * 100000000
      // );
      await DecentralizedOTCContract.exchangeLBT2ERC20(
        1,
        testPoolMap,
        100000,
        0,
        100
      );
      const grantInfo = await LienTokenContract.getGrant(accounts[0], 1);
      const amount = grantInfo[0];

      const res = await DecentralizedOTCContract.calcRateLBT2ERC20.call(
        testSBTID,
        testPoolMap,
        testMaturity
      );

      const expectedAmount = new BigNumber(res.toString())
        .times(100000)
        .times(9995)
        .div(10000)
        .div(10000);

      assert.equal(
        amount.toString(),
        expectedAmount.toString(),
        "unexpected amount"
      );

      await testLiquidInstance.approve(
        DecentralizedOTCContract.address,
        100000
      );
      await DecentralizedOTCContract.exchangeLBT2ERC20(
        1,
        testPoolMap,
        100000,
        0,
        100
      );
      const grantInfo2 = await LienTokenContract.getGrant(accounts[0], 1);
      const amount2 = grantInfo2[0];
      console.log("grant amount 1", grantInfo[0].toString());
      console.log("grant amount 2", grantInfo2[0].toString());
      //assert.equal(amount.times(2).toString(), amount2.toString(), 'unexpected grant amount');
    });
  });

  describe("calcRateLBT2ERC20", () => {
    it(`case 0`, async () => {
      const res = await DecentralizedOTCContract.calcRateLBT2ERC20.call(
        testSBTID,
        testPoolMap,
        testMaturity
      );
      console.log("calcRateE4: ", res.toString());
    });
  });

  describe("transferEther2LienHolders", () => {
    it(`case 0`, async () => {
      const now = await getBlockTimestampSec();
      if (testMaturity >= now) {
        await advanceTime(testMaturity - now + 1);
        await mineOneBlock();
      }
      await OracleContract.testSetOracleData(
        initRateETH2USD * 100000000,
        initVolatility * 100000000
      );
      await BondMakerContract.liquidateBond(testBondGroupID, 0);
      const res = await DecentralizedOTCContract.transferEther2LienHolders([
        testLBTID,
      ]);

      const {burnedBLTAmount, transferredETHAmount} = (() => {
        let logs = {};
        for (let i = 0; i < res.logs.length; i++) {
          const log = res.logs[i];
          if (log.event === "LogTransferLBTValueToLien") {
            const {ETHamount: burnedBLTAmount} = log.args;
            logs = {...logs, burnedBLTAmount};
          }
          if (log.event === "LogTransferETH") {
            const {value: transferredETHAmount} = log.args;
            logs = {...logs, transferredETHAmount};
          }
        }

        return logs as {burnedBLTAmount: any; transferredETHAmount: any};
      })();

      console.log(
        "burnedBLTAmount:     ",
        new BigNumber(burnedBLTAmount.toString()).shiftedBy(-8).toFixed(8)
      );
      console.log(
        "transferredETHAmount:",
        new BigNumber(transferredETHAmount.toString())
          .shiftedBy(-18)
          .toFixed(18)
      );
    });
  });

  describe("deletePoolAndProvider", () => {
    it(`case 0`, async () => {
      await DecentralizedOTCContract.deletePoolAndProvider(testPoolMap);
    });
  });
});

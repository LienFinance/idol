import BigNumber from "bignumber.js";
import testCases from "../testCases";
import {callRegisterBondAndBondGroup} from "../wrapper/callFunction";
import {
  lineSegmentToFnMap,
  advanceTime,
  days,
  getBlockTimestampSec,
  mineOneBlock,
  fromBTAmount,
  toEtherAmount,
  nullAddress,
} from "../util";
import {callGetBond} from "./callFunction";

const Oracle = artifacts.require("TestOracle");
const BondMaker = artifacts.require("BondMaker");
const BondToken = artifacts.require("BondToken");
const Wrapper = artifacts.require("Wrapper");

const fnMaps = [
  lineSegmentToFnMap([
    [0, 0, 120, 120],
    [120, 120, 240, 120],
  ]),
  lineSegmentToFnMap([
    [0, 0, 120, 0],
    [120, 0, 240, 120],
  ]),
];

const fnMaps2 = [
  lineSegmentToFnMap([
    [0, 0, 100, 100],
    [100, 100, 240, 140],
  ]),
  lineSegmentToFnMap([
    [0, 0, 100, 0],
    [100, 0, 240, 60],
  ]),
  lineSegmentToFnMap([
    [0, 0, 100, 0],
    [100, 0, 240, 40],
  ]),
];

contract("BondMaker", () => {
  describe("exchangeEquivalentBonds", () => {
    const cases = testCases["BondMaker"]["exchangeEquivalentBonds"];

    cases.forEach(
      (
        {
          errorMessage,
          periodSecBeforeMaturity,
          inputBondGroup,
          outputBondGroup,
          mintingAmount,
        },
        caseIndex
      ) => {
        it(`case ${caseIndex}`, async () => {
          const oracleContract = await Oracle.deployed();
          const bondMakerContract = await BondMaker.deployed();
          const wrapperContract = await Wrapper.deployed();

          const now = await getBlockTimestampSec();
          const maturity = now + periodSecBeforeMaturity;

          for (const fnMap of [
            ...inputBondGroup.fnMaps.filter(
              (fnMap) => !outputBondGroup.fnMaps.includes(fnMap)
            ),
            ...outputBondGroup.fnMaps,
          ]) {
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
          }

          const inputBondGroupInfo = await callRegisterBondAndBondGroup(
            wrapperContract,
            inputBondGroup.fnMaps,
            maturity
          );
          const newBondGroupID = inputBondGroupInfo.bondGroupID;
          console.log("newBondGroupID", newBondGroupID.toString());

          const outputBondGroupInfo = await callRegisterBondAndBondGroup(
            wrapperContract,
            outputBondGroup.fnMaps,
            maturity
          );
          const outputBondGroupID = outputBondGroupInfo.bondGroupID;
          console.log("outputBondGroupID", outputBondGroupID.toString());

          const exceptionBonds = inputBondGroupInfo.bondIDs.filter((bondID) =>
            outputBondGroupInfo.bondIDs.includes(bondID)
          );

          console.log("exceptionBonds", exceptionBonds);

          await bondMakerContract.issueNewBonds(newBondGroupID, {
            value: new BigNumber(mintingAmount)
              .times(1002)
              .div(1000)
              .shiftedBy(18)
              .toString(10),
          });

          await bondMakerContract.exchangeEquivalentBonds(
            newBondGroupID,
            outputBondGroupID,
            fromBTAmount(mintingAmount),
            exceptionBonds
          );

          await advanceTime(periodSecBeforeMaturity);
          await mineOneBlock();

          await oracleContract.testSetOracleData(
            new BigNumber(200).shiftedBy(8).toString(10),
            new BigNumber(0).shiftedBy(8).toString(10)
          );

          await bondMakerContract.liquidateBond(newBondGroupID, 0);
          await bondMakerContract.liquidateBond(outputBondGroupID, 0);

          let totalObtainedEth = new BigNumber(0);
          for (const bondID of [
            ...inputBondGroupInfo.bondIDs.filter(
              (bondID) => !outputBondGroupInfo.bondIDs.includes(bondID)
            ),
            ...outputBondGroupInfo.bondIDs,
          ]) {
            const bondInfo = await bondMakerContract.getBond(bondID);
            const bondAddress = bondInfo[0];
            const bondInstance = await BondToken.at(bondAddress);
            const res = await bondInstance.burnAll();
            const logs = res.logs.filter(
              (log) => log.event === "LogTransferETH"
            );
            console.log("the number of logs", logs.length);
            const obtainedEth = logs.reduce(
              (acc, log) => acc.plus(toEtherAmount(log.args.value.toString())),
              new BigNumber(0)
            );
            console.log("obtained ETH:", obtainedEth.toFixed(18));
            totalObtainedEth = totalObtainedEth.plus(obtainedEth);
          }

          const epsilon = 1e-7;
          assert.ok(
            new BigNumber(mintingAmount)
              .minus(totalObtainedEth)
              .isLessThanOrEqualTo(epsilon),
            "totalObtainedEth must be equal to paidEth"
          );

          if (errorMessage !== "") {
            assert.fail("should be fail to execute");
          }
        });
      }
    );
  });
});

contract("BondMaker", () => {
  let newBondGroupID: string;

  const periodSecBeforeMaturity = 3 * days;
  const bondAmount = 0.01;

  beforeEach(async () => {
    const wrapperContract = await Wrapper.deployed();
    await advanceTime(1 * days);
    await mineOneBlock();
    const now = await getBlockTimestampSec();
    const res = await callRegisterBondAndBondGroup(
      wrapperContract,
      fnMaps,
      now + periodSecBeforeMaturity
    );
    newBondGroupID = res.bondGroupID;
  });

  it("cannot issue bond token after liquidateBond", async () => {
    const oracleContract = await Oracle.deployed();
    const bondMakerContract = await BondMaker.deployed();

    await bondMakerContract.issueNewBonds(newBondGroupID, {
      value: new BigNumber(bondAmount)
        .times(1002)
        .div(1000)
        .shiftedBy(18)
        .toString(10),
    });

    await advanceTime(periodSecBeforeMaturity);
    await mineOneBlock();

    await oracleContract.testSetOracleData(
      new BigNumber(100).shiftedBy(8).toString(10),
      new BigNumber(0).shiftedBy(8).toString(10)
    );

    try {
      await bondMakerContract.liquidateBond(newBondGroupID, 0);
      await bondMakerContract.issueNewBonds(newBondGroupID, {
        value: new BigNumber(bondAmount)
          .times(1002)
          .div(1000)
          .shiftedBy(18)
          .toString(10),
      });
    } catch (err) {
      return;
    }

    assert.fail(
      "did not fail `cannot issue bond token after liquidateBond` test"
    );
  });
});

contract("BondMaker", () => {
  let newBondGroupID: string;
  let outputBondGroupID: string;
  let anotherBondGroupID: string;

  const periodSecBeforeMaturity = 3 * days;
  const bondAmount = 0.01;

  beforeEach(async () => {
    const wrapperContract = await Wrapper.deployed();
    await advanceTime(1 * days);
    await mineOneBlock();
    const now = await getBlockTimestampSec();
    const res = await callRegisterBondAndBondGroup(
      wrapperContract,
      fnMaps,
      now + periodSecBeforeMaturity
    );
    newBondGroupID = res.bondGroupID;
    const res2 = await callRegisterBondAndBondGroup(
      wrapperContract,
      fnMaps2,
      now + periodSecBeforeMaturity
    );
    outputBondGroupID = res2.bondGroupID;
    const res3 = await callRegisterBondAndBondGroup(
      wrapperContract,
      fnMaps,
      now + periodSecBeforeMaturity + 86400
    );
    anotherBondGroupID = res3.bondGroupID;
  });

  it(`cannot exchangeEquivalentBonds bond token after liquidateBond`, async () => {
    const oracleContract = await Oracle.deployed();
    const bondMakerContract = await BondMaker.deployed();
    await bondMakerContract.issueNewBonds(newBondGroupID, {
      value: new BigNumber(bondAmount)
        .times("1002")
        .div("1000")
        .shiftedBy(18)
        .toString(10),
    });

    await bondMakerContract.issueNewBonds(anotherBondGroupID, {
      value: new BigNumber(bondAmount)
        .times("1002")
        .div("1000")
        .shiftedBy(18)
        .toString(10),
    });

    await advanceTime(periodSecBeforeMaturity);
    await mineOneBlock();

    await oracleContract.testSetOracleData(
      new BigNumber(100).shiftedBy(8).toString(10),
      new BigNumber(0).shiftedBy(8).toString(10)
    );

    await bondMakerContract.liquidateBond(newBondGroupID, 0);

    try {
      await bondMakerContract.exchangeEquivalentBonds(
        newBondGroupID,
        outputBondGroupID,
        fromBTAmount(bondAmount),
        []
      );
    } catch (err) {
      return;
    }

    assert.fail(
      "did not fail `cannot exchangeEquivalentBonds bond token after liquidateBond` test"
    );
  });
});

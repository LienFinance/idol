import testCases from "../testCases";
import {callRegisterBondAndBondGroup} from "../wrapper/callFunction";
import {
  lineSegmentToFnMap,
  fromEtherAmount,
  advanceTime,
  days,
  getBlockTimestampSec,
  mineOneBlock,
  fromBTAmount,
} from "../util";
import BigNumber from "bignumber.js";

const BondMaker = artifacts.require("BondMaker");
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

let newBondGroupID: string;
let outputBondGroupID: string;

contract("BondMaker", (accounts) => {
  describe("exchangeEquivalentBonds", () => {
    const cases = testCases["BondMaker"]["exchangeEquivalentBonds"];
    const periodSecBeforeMaturity = 3 * days;

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
    });

    cases.forEach(({errorMessage, BTAmount}, caseIndex) => {
      it(`case ${caseIndex}`, async () => {
        const bondMakerContract = await BondMaker.deployed();
        console.log(newBondGroupID, "newBondGroupID");
        await bondMakerContract.issueNewBonds(newBondGroupID, {
          value: new BigNumber(BTAmount)
            .times("1002")
            .div("1000")
            .shiftedBy(18)
            .toString(10),
        });

        console.log(outputBondGroupID, "outputBondGroupID");
        try {
          await bondMakerContract.exchangeEquivalentBonds(
            newBondGroupID,
            outputBondGroupID,
            fromBTAmount(BTAmount),
            []
          );
        } catch (err) {
          assert.equal(
            err.message,
            errorMessage,
            "fail to execute exchangeEquivalentBonds"
          );
          return;
        }

        if (errorMessage !== "") {
          assert.fail("did not fail `BondMaker.exchangeEquivalentBonds` test");
        }
      });
    });
  });
});

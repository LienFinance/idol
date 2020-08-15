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

contract("BondMaker", (accounts) => {
  describe("reverseBondToETH", () => {
    const cases = testCases["BondMaker"]["reverseBondToETH"];
    const periodSecBeforeMaturity = 3 * days;
    let newBondGroupID: string;

    beforeEach(async () => {
      const wrapperContract = await Wrapper.deployed();
      await advanceTime(1 * days);
      await mineOneBlock();
      const now = await getBlockTimestampSec();
      const {bondGroupID} = await callRegisterBondAndBondGroup(
        wrapperContract,
        fnMaps,
        now + periodSecBeforeMaturity
      );
      newBondGroupID = bondGroupID;
    });

    cases.forEach(
      ({errorMessage, mintSBTAmount, burnSBTAmount, expired}, caseIndex) => {
        it(`case ${caseIndex}`, async () => {
          const bondMakerContract = await BondMaker.deployed();
          await bondMakerContract.issueNewBonds(newBondGroupID, {
            value: new BigNumber(mintSBTAmount)
              .times("1002")
              .div("1000")
              .shiftedBy(18)
              .toString(10),
          });

          if (expired) {
            await advanceTime(periodSecBeforeMaturity);
            await mineOneBlock();
          }

          try {
            await bondMakerContract.reverseBondToETH(
              newBondGroupID,
              fromBTAmount(burnSBTAmount)
            );
          } catch (err) {
            assert.equal(
              err.message,
              errorMessage,
              "fail to execute reverseBondToETH"
            );
            return;
          }

          if (errorMessage !== "") {
            assert.fail("did not fail `BondMaker.reverseBondToETH` test");
          }
        });
      }
    );
  });
});

// import BigNumber from 'bignumber.js';
// import * as moment from 'moment';
import testCases from "../testCases";
import {callRegisterNewBond} from "./callFunction";
import {getBlockTimestampSec} from "../util";

const BondMaker = artifacts.require("BondMaker");

contract("BondMaker", () => {
  // describe('getBondType', () => {
  //     const cases = testCases['BondMaker']['getBondType'];
  //     cases.forEach(({ periodSecBeforeMaturity, fnMap }, caseIndex) => {
  //         it(`case ${caseIndex}`, async () => {
  //             const bondMakerContract = await BondMaker.deployed();
  //             const now = await getBlockTimestampSec();
  //             const maturity = now + periodSecBeforeMaturity;
  //             const { bondID: newBondID } = await callRegisterNewBond(
  //                 bondMakerContract,
  //                 maturity,
  //                 fnMap
  //             );
  //             const res = await bondMakerContract.getBond(newBondID);
  //             const actualFnMap = await bondMakerContract.getFnMap(res[3]);
  //             assert.equal(actualFnMap, fnMap, `invalid bond type`);
  //         });
  //     });
  // });
});

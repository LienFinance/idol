// import BigNumber from 'bignumber.js';
// import * as moment from 'moment';
import testCases from "../testCases";
import {callRegisterNewBond} from "./callFunction";

const BondMaker = artifacts.require("BondMaker");

contract("BondMaker", () => {
  describe("getBondType", () => {
    const cases = testCases["BondMaker"]["getBondType"];

    cases.forEach(({success, maturity, fnMap}, caseIndex) => {
      it(`case ${caseIndex}`, async () => {
        const bondMakerContract = await BondMaker.deployed();
        let actualFnMap: string;
        try {
          const {bondID: newBondID} = await callRegisterNewBond(
            bondMakerContract,
            maturity,
            fnMap
          );

          if (!success) {
            assert.fail(`did not fail to call registerNewBond`);
          }

          const res = await bondMakerContract.getBond(newBondID);
          actualFnMap = await bondMakerContract.getFnMap(res[3]);
        } catch (err) {
          if (!success) {
            return;
          }
          throw err;
        }

        assert.equal(actualFnMap, fnMap, `invalid bond type`);
      });
    });
  });
});

import testCases from "../testCases";
import {callRegisterNewBond, callGetBond} from "./callFunction";
import {getBondTokenName, getBlockTimestampSec} from "../util";

const BondMaker = artifacts.require("BondMaker");
const BondToken = artifacts.require("BondToken");

contract("BondMaker", (accounts) => {
  describe("generateBondID", () => {
    const cases = testCases["BondMaker"]["generateBondID"];

    cases.forEach(({maturity, fnMap, bondID}, caseIndex) => {
      it(`case ${caseIndex}`, async () => {
        const bondMakerContract = await BondMaker.deployed();
        const actualBondID = await bondMakerContract.generateBondID(
          maturity,
          fnMap
        );

        assert.equal(actualBondID, bondID, `invalid bond ID`);
      });
    });
  });

  describe("registerNewBond", () => {
    const cases = testCases["BondMaker"]["registerNewBond"];

    cases.forEach(
      ({errorMessage, periodSecBeforeMaturity, fnMap}, caseIndex) => {
        it(`case ${caseIndex}`, async () => {
          const bondMakerContract = await BondMaker.deployed();
          const now = await getBlockTimestampSec();
          const maturity = now + periodSecBeforeMaturity;

          let bondID: string;
          try {
            const bondInfo = await callRegisterNewBond(
              bondMakerContract,
              maturity,
              fnMap
            );
            bondID = bondInfo.bondID;
          } catch (err) {
            if (err.message === errorMessage) {
              return;
            }
            throw err;
          }

          const {bondTokenAddress} = await callGetBond(
            bondMakerContract,
            bondID
          );
          const [shortName, longName] = getBondTokenName(
            fnMap,
            new Date(maturity * 1000)
          );
          const bondTokenContract = await BondToken.at(bondTokenAddress);
          const symbol = await bondTokenContract.symbol();
          const name = await bondTokenContract.name();

          assert.equal(
            symbol,
            shortName,
            "the symbol of bond token differ from expected"
          );
          assert.equal(
            name,
            longName,
            "the name of bond token differ from expected"
          );

          if (errorMessage !== "") {
            assert.fail("did not fail `BondMaker.registerNewBond` test");
          }
        });
      }
    );
  });

  // describe('getBond', () => {
  //     const cases = testCases['BondMaker']['getBond'];

  //     cases.forEach(({ bondID, stableStrikePrice }, caseIndex) => {
  //         it(`case ${caseIndex}`, async () => {
  //             const bondMakerContract = await BondMaker.deployed();
  //             const { solidStrikePrice } = await callGetBond(bondMakerContract, bondID);

  //             assert.equal(
  //                 solidStrikePrice.toString(),
  //                 stableStrikePrice.toString(),
  //                 `invalid solid strike price`
  //             );
  //         });
  //     });
  // });
});

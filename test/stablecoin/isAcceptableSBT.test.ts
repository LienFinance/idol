import {BigNumber} from "bignumber.js";

import testCases, {fnMapSolid1} from "../testCases";
import {getBlockTimestampSec, days} from "../util";
import {callRegisterNewBond} from "../bondmaker/callFunction";
import {init} from "../init";
import {callIsAcceptableSBT} from "./callFunction";

const StableCoin = artifacts.require("TestStableCoin");
const BondMaker = artifacts.require("TestBondMaker");
const Auction = artifacts.require("TestAuction");
const AuctionBoard = artifacts.require("TestAuctionBoard");
const Oracle = artifacts.require("TestOracle");

contract("StableCoin", async (accounts) => {
  describe("isAcceptableSBT", () => {
    let now: number;
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
      const bondMakerContract = await BondMaker.at(contractAddresses.bondMaker);
      now = await getBlockTimestampSec();
      await callRegisterNewBond(
        bondMakerContract,
        now + 15 * days,
        fnMapSolid1
      );
    });

    const cases = testCases["StableCoin"]["isAcceptableSBT"];

    cases.forEach(
      (
        {
          errorMessage,
          periodSecBeforeMaturity,
          fnMap,
          rateETH2USD,
          volatility,
          isAcceptable,
        },
        caseIndex
      ) => {
        it(`case ${caseIndex}`, async () => {
          const IDOLContract = await StableCoin.at(contractAddresses.idol);
          const bondMakerContract = await BondMaker.at(
            contractAddresses.bondMaker
          );
          const oracleContract = await Oracle.at(contractAddresses.oracle);
          await oracleContract.testSetOracleData(
            new BigNumber(rateETH2USD).shiftedBy(8).toString(10),
            new BigNumber(volatility).shiftedBy(8).toString(10)
          );

          const bondID = await bondMakerContract.generateBondID(
            now + periodSecBeforeMaturity,
            fnMap
          );

          let actualIsAcceptable: boolean;
          try {
            // const isAcceptable = await IDOLContract.isAcceptableSBT.call(bondID);
            // OR
            const {isAcceptable} = await callIsAcceptableSBT(
              IDOLContract,
              bondID
            );
            actualIsAcceptable = isAcceptable;
          } catch (err) {
            if (errorMessage != "") {
              return;
            }
            throw err;
          }

          if (errorMessage != "") {
            assert.fail(`did not fail to call isAcceptableSBT`);
          }

          assert.equal(
            actualIsAcceptable,
            isAcceptable,
            "`isAcceptable` differ from expected"
          );
        });
      }
    );
  });
});

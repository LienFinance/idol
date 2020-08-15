import * as fs from "fs";
import {BigNumber} from "bignumber.js";

import {testPattern4Factory} from "./testPattern4Factory";
import {pat4cases} from "./testCases";

BigNumber.set({ROUNDING_MODE: BigNumber.ROUND_DOWN});

const StableCoin = artifacts.require("StableCoin");
const BondMaker = artifacts.require("BondMaker");
const Auction = artifacts.require("Auction");
const AuctionBoard = artifacts.require("AuctionBoard");

import {init} from "../../init";
import {MarkDownLogger} from "../../util";

contract("scenario", (accounts) => {
  let contractAddresses: {
    oracle: string;
    bondMaker: string;
    idol: string;
    auction: string;
    auctionBoard: string;
    wrapper: string;
    lienToken: string;
  };

  beforeEach(async () => {
    contractAddresses = await init(
      BondMaker,
      StableCoin,
      Auction,
      AuctionBoard
    );
  });

  describe("pattern 4: recover from an emergency", () => {
    Object.entries(pat4cases).forEach(([caseIndex, caseValue]) => {
      it(`case ${caseIndex}`, async () => {
        const summaryLogger = new MarkDownLogger();

        {
          const {abstraction} = caseValue;
          if (abstraction) {
            summaryLogger.h2("Abstraction").log(abstraction);
          }
        }

        try {
          await testPattern4Factory(accounts, contractAddresses)(
            {
              ...caseValue,
              useWrapper: false,
            },
            summaryLogger
          );
        } catch (err) {
          summaryLogger.h2("Error").log(err.message);
          throw err;
        } finally {
          const summaryFileDir = "./test/scenario/pattern4/summaries";
          fs.mkdirSync(summaryFileDir, {recursive: true});
          fs.writeFileSync(
            summaryFileDir + `/${caseIndex}.md`,
            summaryLogger.toString()
          );
        }
      });
    });
  });
});

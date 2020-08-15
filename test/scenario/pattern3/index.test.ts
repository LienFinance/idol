import * as fs from "fs";

import {pat3cases} from "./testCases";
import {Pattern3TestCase, viewer} from "./utils";
import {init} from "../../init";
import {testPattern3Factory} from "./testPattern3Factory";
import {MarkDownLogger} from "../../util";
import {pat3Desc} from "./pat3Logger";

const StableCoin = artifacts.require("TestStableCoin");
const BondMaker = artifacts.require("TestBondMaker");
const Auction = artifacts.require("TestAuction");
const AuctionBoard = artifacts.require("TestAuctionBoard");

const env = process.env;

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

  describe("pattern 3: restart auction", () => {
    const format = env.FORMAT;
    switch (format) {
      case "json": {
        const target = env.JSON;
        if (!target || target == "") {
          console.log(
            "the json file path of test cases is needed: env JSON=xx.json yarn test:json"
          );
          return;
        } else {
          const caseIndex = new Date().getTime();
          const log = fs.readFileSync(target).toString();
          const caseValue = JSON.parse(log) as Pattern3TestCase;

          it(`json case ${caseIndex}`, async () => {
            const summaryLogger = new MarkDownLogger();
            summaryLogger.log(pat3Desc());

            try {
              await testPattern3Factory(accounts, contractAddresses)(
                {
                  ...caseValue,
                  useWrapper: false,
                },
                summaryLogger
              );
            } catch (err) {
              summaryLogger.h2("Error").log(err.message);
              fs.writeFileSync(
                `./test/scenario/pattern3/cases/${caseIndex}.json`,
                JSON.stringify(caseValue, null, 4)
              );
              throw err;
            } finally {
              fs.writeFileSync(
                `./test/scenario/pattern3/summaries/${caseIndex}.md`,
                summaryLogger.toString()
              );
            }
          });
        }
        break;
      }
      default: {
        const fromIndex =
          env.FROM === undefined || Number.isNaN(Number(env.FROM))
            ? 0
            : Number(env.FROM);
        const toIndex =
          env.TO === undefined || Number.isNaN(Number(env.TO))
            ? Infinity
            : Number(env.TO);
        Object.entries(pat3cases).forEach(([caseIndex, caseValue]) => {
          if (
            !(Number(caseIndex) >= fromIndex && Number(caseIndex) <= toIndex)
          ) {
            return;
          }
          it(`case ${caseIndex}`, async () => {
            viewer(caseValue);

            const summaryLogger = new MarkDownLogger();
            summaryLogger.log(pat3Desc());

            {
              const {abstraction} = caseValue;
              if (abstraction) {
                summaryLogger.h2("Abstraction").log(abstraction);
              }
            }

            try {
              await testPattern3Factory(accounts, contractAddresses)(
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
              const summaryFileDir = "./test/scenario/pattern3/summaries";
              fs.mkdirSync(summaryFileDir, {recursive: true});
              fs.writeFileSync(
                summaryFileDir + `/${caseIndex}.md`,
                summaryLogger.toString()
              );
            }
          });
        });
        break;
      }
    }
  });
});

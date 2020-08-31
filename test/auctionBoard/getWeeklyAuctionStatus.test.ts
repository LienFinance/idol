import testCases from "../testCases";
import {callGetAuctionStatus} from "./callFunction";

import {init} from "../init";

const BondMaker = artifacts.require("TestBondMaker");
const StableCoin = artifacts.require("TestStableCoin");
const AuctionBoard = artifacts.require("TestAuctionBoard");
const Auction = artifacts.require("TestAuction");

contract("Auction", () => {
  let contractAddresses: {
    auction: string;
  };

  beforeEach(async () => {
    contractAddresses = await init(
      BondMaker,
      StableCoin,
      Auction,
      AuctionBoard
    );
  });

  describe("getWeeklyAuctionStatus", () => {
    const cases = testCases["Auction"]["getWeeklyAuctionStatus"];
    cases.forEach(({closingTime, listingTime, output}, caseIndex) => {
      it(`case ${caseIndex}`, async () => {
        const auctionInstance = await Auction.at(contractAddresses.auction);

        for (const auctionID of Object.keys(closingTime)) {
          for (const {isEmergency, timestamp} of closingTime[auctionID]) {
            await auctionInstance.testSetAuctionClosingTime(
              auctionID,
              isEmergency,
              timestamp
            );
          }
        }

        const auctionStatus = await callGetAuctionStatus(
          auctionInstance,
          listingTime
        );
        assert.equal(
          JSON.stringify(auctionStatus, null, 2),
          JSON.stringify(output, null, 2)
        );
      });
    });
  });
});

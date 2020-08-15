import testCases from "../testCases";
import {days} from "../util";

import {
  minNormalAuctionPeriod,
  minEmergencyAuctionPeriod,
  normalAuctionRevealSpan,
  emergencyAuctionRevealSpan,
  auctionWithdrawSpan,
  emergencyAuctionWithdrawSpan,
} from "../constants";

const AuctionTimeControl = artifacts.require("TestAuctionTimeControl");

contract("AuctionTimeControl", () => {
  describe("listAuction", () => {
    const cases = testCases["AuctionTimeControl"]["listAuction"];
    cases.forEach(({closingTime, listingTime, output}, caseIndex) => {
      it(`case ${caseIndex}`, async () => {
        const auctionTimeControlInstance = await AuctionTimeControl.new(
          minNormalAuctionPeriod,
          minEmergencyAuctionPeriod,
          normalAuctionRevealSpan,
          emergencyAuctionRevealSpan,
          auctionWithdrawSpan,
          emergencyAuctionWithdrawSpan
        );
        for (const auctionID of Object.keys(closingTime)) {
          for (const {isEmergency, timestamp} of closingTime[auctionID]) {
            auctionTimeControlInstance.testSetAuctionClosingTime(
              auctionID,
              isEmergency,
              timestamp
            );
          }
        }

        let res: string[][] = [];
        for (
          let weekNumber = Math.floor(listingTime.from / (7 * days));
          weekNumber <= Math.floor(listingTime.to / (7 * days));
          weekNumber++
        ) {
          res.push(await auctionTimeControlInstance.listAuction(weekNumber));
        }

        assert.equal(JSON.stringify(res), JSON.stringify(output));
      });
    });
  });
});

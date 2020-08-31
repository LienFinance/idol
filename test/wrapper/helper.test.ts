import {testHelperPatternFactory} from "./helper.test-setup";
import {init} from "../init";
import testCases from "../testCases";

const StableCoin = artifacts.require("TestStableCoin");
const BondMaker = artifacts.require("TestBondMaker");
const Auction = artifacts.require("TestAuction");
const AuctionBoard = artifacts.require("TestAuctionBoard");
const Helper = artifacts.require("Helper");

contract("AuctionBoard", (accounts) => {
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
      AuctionBoard,
      {
        maxPriceIndex: 9,
      }
    );
  });

  describe("functions in the file", () => {
    it("maxPriceIndex", async () => {
      const helper = await Helper.new(
        contractAddresses.oracle,
        contractAddresses.bondMaker,
        contractAddresses.auction,
        contractAddresses.auctionBoard,
        72 * 3600
      );
      const helperAddress = helper.address;
      const caseValue =
        testCases["AuctionBoard"]["revealBids"]["maxPriceIndex"];
      await testHelperPatternFactory(
        accounts,
        contractAddresses,
        helperAddress
      )({
        ...caseValue,
        useWrapper: false,
      });
    });
  });
});

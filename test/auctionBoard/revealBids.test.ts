import {testPattern3Factory} from "../scenario/pattern3/testPattern3Factory";
import {init} from "../init";
import testCases from "../testCases";

const StableCoin = artifacts.require("TestStableCoin");
const BondMaker = artifacts.require("TestBondMaker");
const Auction = artifacts.require("TestAuction");
const AuctionBoard = artifacts.require("TestAuctionBoard");

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

  describe("revealBids", () => {
    it("maxPriceIndex", async () => {
      const caseValue =
        testCases["AuctionBoard"]["revealBids"]["maxPriceIndex"];
      await testPattern3Factory(
        accounts,
        contractAddresses
      )({
        ...caseValue,
        useWrapper: false,
      });
    });
  });
});

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
        maxBoardIndex: 9,
      }
    );
  });

  describe("revealBids", () => {
    it("maxBoardIndex", async () => {
      const caseValue =
        testCases["AuctionBoard"]["revealBids"]["maxBoardIndex"];
      await testPattern3Factory(
        accounts,
        contractAddresses
      )({
        ...caseValue,
        useWrapper: false,
      });
    });
  });
});

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
        maxBoardIndexAtEndPrice: 9,
      }
    );
  });

  describe("revealBids", () => {
    it("maxBoardIndexAtEndPrice", async () => {
      const caseValue =
        testCases["AuctionBoard"]["revealBids"]["maxBoardIndexAtEndPrice"];
      await testPattern3Factory(
        accounts,
        contractAddresses
      )({
        ...caseValue,
        useWrapper: false,
      });
    });
  });
});

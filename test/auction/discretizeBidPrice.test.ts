const AuctionBoard = artifacts.require("AuctionBoard");

contract("AuctionBoard", () => {
  describe("discretizeBidPrice", () => {
    it(`case1`, async () => {
      const auctionBoardContract = await AuctionBoard.deployed();
      let price1E8 = await auctionBoardContract.discretizeBidPrice(1111111111);
      console.log("price1E8: ", price1E8.toString());
      let price2E8 = await auctionBoardContract.discretizeBidPrice(11111111111);
      console.log("price2E8: ", price2E8.toString());
      let price3E8 = await auctionBoardContract.discretizeBidPrice(
        111111111111
      );
      console.log("price3E8: ", price3E8.toString());
      let price4E8 = await auctionBoardContract.discretizeBidPrice(
        1111111111111
      );
      console.log("price4E8: ", price4E8.toString());
      let price5E8 = await auctionBoardContract.discretizeBidPrice(
        11111111111111
      );
      console.log("price5E8: ", price5E8.toString());
      let price6E8 = await auctionBoardContract.discretizeBidPrice(
        111111111111111
      );
      console.log("price6E8: ", price6E8.toString());
    });
  });
});

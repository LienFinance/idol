pragma solidity 0.6.6;

import "./AuctionBoard.sol";


contract TestAuctionBoard is AuctionBoard {
    constructor(
        address bondMakerAddress,
        address IDOLAddress,
        uint16 maxPriceIndex,
        uint64 maxBoardIndex,
        uint64 maxBoardIndexAtEndPrice,
        uint16 maxBidCountPerAddress,
        uint64 minTargetSBTAmount
    )
        public
        AuctionBoard(
            bondMakerAddress,
            IDOLAddress,
            maxPriceIndex,
            maxBoardIndex,
            maxBoardIndexAtEndPrice,
            maxBidCountPerAddress,
            minTargetSBTAmount
        )
    {}

    function doneMakeEndInfo(bytes32 auctionID) external view returns (bool) {
        return auctionDisposalInfo[auctionID].isEndInfoCreated;
    }
}

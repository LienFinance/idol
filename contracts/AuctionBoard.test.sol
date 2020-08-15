pragma solidity 0.6.6;

import "./AuctionBoard.sol";


contract TestAuctionBoard is AuctionBoard {
    constructor(
        address bondMakerAddress,
        address IDOLAddress,
        uint256 maxPriceIndex,
        uint256 maxBoardIndex,
        uint256 maxBoardIndexAtEndPrice,
        uint256 maxBidCountPerAddress
    )
        public
        AuctionBoard(
            bondMakerAddress,
            IDOLAddress,
            maxPriceIndex,
            maxBoardIndex,
            maxBoardIndexAtEndPrice,
            maxBidCountPerAddress
        )
    {}

    function bidWithMemo(
        bytes32 auctionID,
        bytes32 secret,
        uint64 targetSBTAmount,
        bytes memory memo
    ) public override {
        require(
            _auctionContract.isInPeriod(auctionID, ACCEPTING_BIDS_PERIOD_FLAG),
            "it is not the time to accept bids"
        );

        (, , uint256 solidStrikePriceE4, ) = _getBondFromAuctionID(auctionID);
        uint256 strikePriceIDOLAmount = _IDOLContract.calcSBT2IDOL(
            solidStrikePriceE4.mul(targetSBTAmount)
        );
        // require(strikePriceIDOLAmount > 10**10, "at least 100 iDOL is required for the bid Amount");

        _bidWithMemo(
            auctionID,
            secret,
            targetSBTAmount,
            strikePriceIDOLAmount,
            memo
        );
    }

    function doneMakeEndInfo(bytes32 auctionID) external view returns (bool) {
        return auctionDisposalInfo[auctionID].isEndInfoCreated;
    }
}

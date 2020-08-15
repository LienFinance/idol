pragma solidity 0.6.6;


interface AuctionBoardInterface {
    event LogBidMemo(
        bytes32 indexed auctionID,
        address indexed bidder,
        bytes memo
    );

    event LogInsertBoard(
        bytes32 indexed auctionID,
        address indexed bidder,
        uint64 bidPrice,
        uint64 boardIndex,
        uint64 targetSBTAmount
    );

    event LogAuctionInfoDiff(
        bytes32 indexed auctionID,
        uint64 settledAmount,
        uint64 paidIDOL,
        uint64 rewardedSBT
    );

    function bidWithMemo(
        bytes32 auctionID,
        bytes32 secret,
        uint64 totalSBTAmountBid,
        bytes calldata memo
    ) external;

    function revealBids(
        bytes32 auctionID,
        uint64[] calldata bids,
        uint64 random
    ) external;

    function sortBidPrice(bytes32 auctionID, uint64[] calldata sortedPrice)
        external;

    function makeEndInfo(bytes32 auctionID) external;

    function calcBill(
        bytes32 auctionID,
        uint64 winnerAmount,
        uint64 myLowestPrice
    ) external view returns (uint64 paymentAmount);

    function getUnsortedBidPrice(bytes32 auctionID)
        external
        view
        returns (uint64[] memory bidPriceList);

    function getSortedBidPrice(bytes32 auctionID)
        external
        view
        returns (uint64[] memory bidPriceList);

    function getEndInfo(bytes32 auctionID)
        external
        view
        returns (
            uint64 price,
            uint64 boardIndex,
            uint64 loseSBTAmount,
            uint64 auctionEndPriceWinnerSBTAmount
        );

    function getBidderStatus(bytes32 auctionID, address bidder)
        external
        view
        returns (uint64 toBack, bool isIDOLReturned);

    function getBoard(
        bytes32 auctionID,
        uint64 price,
        uint64 boardIndex
    ) external view returns (address bidder, uint64 amount);

    function getBoardStatus(bytes32 auctionID)
        external
        view
        returns (uint64[] memory boardStatus);

    function generateMultiSecret(
        bytes32 auctionID,
        uint64[] calldata bids,
        uint64 random
    ) external pure returns (bytes32 secret);

    function discretizeBidPrice(uint64 price)
        external
        pure
        returns (uint64 discretizedPrice);
}

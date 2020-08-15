pragma solidity 0.6.6;


interface AuctionTimeControlInterface {
    enum TimeControlFlag {
        BEFORE_AUCTION_FLAG,
        ACCEPTING_BIDS_PERIOD_FLAG,
        REVEALING_BIDS_PERIOD_FLAG,
        RECEIVING_SBT_PERIOD_FLAG,
        AFTER_AUCTION_FLAG
    }

    function listAuction(uint256 timestamp)
        external
        view
        returns (bytes32[] memory);

    function getTimeControlFlag(bytes32 auctionID)
        external
        view
        returns (TimeControlFlag);

    function isInPeriod(bytes32 auctionID, TimeControlFlag flag)
        external
        view
        returns (bool);

    function isAfterPeriod(bytes32 auctionID, TimeControlFlag flag)
        external
        view
        returns (bool);
}

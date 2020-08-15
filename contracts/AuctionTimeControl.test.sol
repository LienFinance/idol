pragma solidity 0.6.6;

import "./AuctionTimeControl.sol";


contract TestAuctionTimeControl is AuctionTimeControl {
    constructor(
        uint256 minNormalAuctionPeriod,
        uint256 minEmergencyAuctionPeriod,
        uint256 normalAuctionRevealSpan,
        uint256 emergencyAuctionRevealSpan,
        uint256 auctionWithdrawSpan,
        uint256 emergencyAuctionWithdrawSpan
    )
        public
        AuctionTimeControl(
            minNormalAuctionPeriod,
            minEmergencyAuctionPeriod,
            normalAuctionRevealSpan,
            emergencyAuctionRevealSpan,
            auctionWithdrawSpan,
            emergencyAuctionWithdrawSpan
        )
    {}

    /**
     * @dev This function is for test to set the auction closing time freely.
     */
    function testSetAuctionClosingTime(
        bytes32 auctionID,
        bool isEmergency,
        uint256 closingTime
    ) public {
        _setAuctionClosingTime(auctionID, isEmergency, closingTime);
    }
}

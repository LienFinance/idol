pragma solidity 0.6.6;
import "./util/Time.sol";
import "./AuctionTimeControlInterface.sol";


contract AuctionTimeControl is Time, AuctionTimeControlInterface {
    uint256 internal immutable MIN_NORMAL_AUCTION_PERIOD;
    uint256 internal immutable MIN_EMERGENCY_AUCTION_PERIOD;
    uint256 internal immutable NORMAL_AUCTION_REVEAL_SPAN;
    uint256 internal immutable EMERGENCY_AUCTION_REVEAL_SPAN;
    uint256 internal immutable AUCTION_WITHDRAW_SPAN;
    uint256 internal immutable EMERGENCY_AUCTION_WITHDRAW_SPAN;

    TimeControlFlag internal constant BEFORE_AUCTION_FLAG = TimeControlFlag
        .BEFORE_AUCTION_FLAG;
    TimeControlFlag internal constant ACCEPTING_BIDS_PERIOD_FLAG = TimeControlFlag
        .ACCEPTING_BIDS_PERIOD_FLAG;
    TimeControlFlag internal constant REVEALING_BIDS_PERIOD_FLAG = TimeControlFlag
        .REVEALING_BIDS_PERIOD_FLAG;
    TimeControlFlag internal constant RECEIVING_SBT_PERIOD_FLAG = TimeControlFlag
        .RECEIVING_SBT_PERIOD_FLAG;
    TimeControlFlag internal constant AFTER_AUCTION_FLAG = TimeControlFlag
        .AFTER_AUCTION_FLAG;

    /**
     * @dev Get whether the auction is in emergency or not.
     */
    mapping(bytes32 => bool) public isAuctionEmergency;

    /**
     * @dev The end time that the auction accepts bids.
     * The zero value indicates the auction is not held.
     */
    mapping(bytes32 => uint256) public auctionClosingTime;

    /**
     * @dev The contents in this internal storage variable can be seen by listAuction function.
     */
    mapping(uint256 => bytes32[]) internal _weeklyAuctionList;

    constructor(
        uint256 minNormalAuctionPeriod,
        uint256 minEmergencyAuctionPeriod,
        uint256 normalAuctionRevealSpan,
        uint256 emergencyAuctionRevealSpan,
        uint256 auctionWithdrawSpan,
        uint256 emergencyAuctionWithdrawSpan
    ) public {
        MIN_NORMAL_AUCTION_PERIOD = minNormalAuctionPeriod;
        MIN_EMERGENCY_AUCTION_PERIOD = minEmergencyAuctionPeriod;
        NORMAL_AUCTION_REVEAL_SPAN = normalAuctionRevealSpan;
        EMERGENCY_AUCTION_REVEAL_SPAN = emergencyAuctionRevealSpan;
        AUCTION_WITHDRAW_SPAN = auctionWithdrawSpan;
        EMERGENCY_AUCTION_WITHDRAW_SPAN = emergencyAuctionWithdrawSpan;
    }

    /**
     * @dev Get auctions which will close within the week.
     */
    function listAuction(uint256 weekNumber)
        public
        override
        view
        returns (bytes32[] memory)
    {
        return _weeklyAuctionList[weekNumber];
    }

    /**
     * @notice Gets the period the auction is currently in.
     * This function returns 0-4 corresponding to its period.
     */
    function getTimeControlFlag(bytes32 auctionID)
        public
        override
        view
        returns (TimeControlFlag)
    {
        uint256 closingTime = auctionClosingTime[auctionID];

        // Note that the auction span differs based on whether the auction is in emergency or not.
        bool isEmergency = isAuctionEmergency[auctionID];
        uint256 revealSpan = NORMAL_AUCTION_REVEAL_SPAN;
        uint256 withdrawSpan = AUCTION_WITHDRAW_SPAN;
        if (isEmergency) {
            revealSpan = EMERGENCY_AUCTION_REVEAL_SPAN;
            withdrawSpan = EMERGENCY_AUCTION_WITHDRAW_SPAN;
        }

        uint256 nowTime = _getBlockTimestampSec();
        if (closingTime == 0) {
            return BEFORE_AUCTION_FLAG;
        } else if (nowTime <= closingTime) {
            return ACCEPTING_BIDS_PERIOD_FLAG;
        } else if (nowTime < closingTime + revealSpan) {
            return REVEALING_BIDS_PERIOD_FLAG;
        } else if (nowTime < closingTime + revealSpan + withdrawSpan) {
            return RECEIVING_SBT_PERIOD_FLAG;
        } else {
            return AFTER_AUCTION_FLAG;
        }
    }

    /**
     * @notice This function returns whether or not the auction is in the period indicated
     * by the flag.
     */
    function isInPeriod(bytes32 auctionID, TimeControlFlag flag)
        public
        override
        view
        returns (bool)
    {
        return getTimeControlFlag(auctionID) == flag;
    }

    /**
     * @notice Returns whether or not the auction is in or after the period indicated
     * by the flag.
     */
    function isAfterPeriod(bytes32 auctionID, TimeControlFlag flag)
        public
        override
        view
        returns (bool)
    {
        return getTimeControlFlag(auctionID) >= flag;
    }

    /**
     * @dev Calculates and registers the end time of the period in which the auction accepts bids
     * (= closingTime). The period in which bids are revealed follows after this time.
     */
    function _setAuctionClosingTime(bytes32 auctionID, bool isEmergency)
        internal
    {
        uint256 closingTime;

        if (isEmergency) {
            closingTime =
                ((_getBlockTimestampSec() +
                    MIN_EMERGENCY_AUCTION_PERIOD +
                    5 minutes -
                    1) / 5 minutes) *
                (5 minutes);
        } else {
            closingTime =
                ((_getBlockTimestampSec() +
                    MIN_NORMAL_AUCTION_PERIOD +
                    1 hours -
                    1) / 1 hours) *
                (1 hours);
        }
        _setAuctionClosingTime(auctionID, isEmergency, closingTime);
    }

    /**
     * @dev Registers the end time of the period in which the auction accepts bids (= closingTime).
     * The period in which bids are revealed follows after this time.
     */
    function _setAuctionClosingTime(
        bytes32 auctionID,
        bool isEmergency,
        uint256 closingTime
    ) internal {
        isAuctionEmergency[auctionID] = isEmergency;
        auctionClosingTime[auctionID] = closingTime;
        uint256 weekNumber = closingTime / (1 weeks);
        _weeklyAuctionList[weekNumber].push(auctionID);
    }
}

pragma solidity 0.6.6;

import "./AuctionTimeControlInterface.sol";


interface AuctionInterface is AuctionTimeControlInterface {
    event LogStartAuction(bytes32 indexed auctionID, bytes32 bondID);

    event LogCancelBid(
        bytes32 indexed auctionID,
        address indexed bidder,
        bytes32 secret,
        uint256 returnedIDOLAmount
    );

    event LogAuctionResult(
        bytes32 indexed auctionID,
        address indexed bidder,
        uint256 SBTAmountOfReward,
        uint256 IDOLAmountOfPayment,
        uint256 IDOLAmountOfChange
    );

    event LogCloseAuction(
        bytes32 indexed auctionID,
        bool isLast,
        bytes32 nextAuctionID
    );

    function ongoingAuctionSBTTotal(bytes32 auctionID)
        external
        view
        returns (uint64 ongoingSBTAmountE8);

    function startAuction(
        bytes32 bondID,
        uint64 auctionAmount,
        bool isEmergency
    ) external returns (bytes32 auctonID);

    function cancelBid(bytes32 auctionID, bytes32 secret)
        external
        returns (uint64 returnedIDOLAmount);

    function makeAuctionResult(
        bytes32 auctionID,
        uint64 myLowestPrice,
        uint64[] calldata winnerBids,
        uint64[] calldata loserBids
    )
        external
        returns (
            uint64 winnerAmount,
            uint64 toPay,
            uint64 IDOLAmountOfChange
        );

    function closeAuction(bytes32 auctionID)
        external
        returns (bool isLast, bytes32 nextAuctionID);

    function receiveUnrevealedBidDistribution(bytes32 auctionID, bytes32 secret)
        external
        returns (bool success);

    function getCurrentAuctionID(bytes32 bondID)
        external
        view
        returns (bytes32 auctionID);

    function generateAuctionID(bytes32 bondID, uint256 auctionCount)
        external
        pure
        returns (bytes32 auctionID);

    function listBondIDFromAuctionID(bytes32[] calldata auctionIDs)
        external
        view
        returns (bytes32[] memory bondIDs);

    function getAuctionStatus(bytes32 auctionID)
        external
        view
        returns (
            uint256 closingTime,
            uint64 auctionAmount,
            uint64 rewardedAmount,
            uint64 totalSBTAmountBid,
            bool isEmergency,
            bool doneFinalizeWinnerAmount,
            bool doneSortPrice,
            uint64 lowestBidPriceDeadLine,
            uint64 highestBidPriceDeadLine,
            uint64 totalSBTAmountPaidForUnrevealed
        );

    function getWeeklyAuctionStatus(uint256 weekNumber)
        external
        view
        returns (uint256[] memory weeklyAuctionStatus);

    function calcWinnerAmount(
        bytes32 auctionID,
        address sender,
        uint64[] calldata winnerBids
    ) external view returns (uint64 winnerAmount);

    function calcBillAndCheckLoserBids(
        bytes32 auctionID,
        address sender,
        uint64 winnerAmountInput,
        uint64 myLowestPrice,
        uint64[] calldata myLoseBids
    ) external view returns (uint64 paymentAmount);

    function getAuctionCount(bytes32 bondID)
        external
        view
        returns (uint256 auctionCount);
}

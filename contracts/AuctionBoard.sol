pragma solidity 0.6.6;

import "./util/DeployerRole.sol";
import "./math/UseSafeMath.sol";
import "./AuctionBoardInterface.sol";
import "./AuctionTimeControlInterface.sol";
import "./Auction.sol";
import "./auction/AuctionSecret.sol";
import "./bondToken/BondTokenInterface.sol";
import "./UseBondMaker.sol";
import "./UseStableCoin.sol";
import "./UseAuctionLater.sol";
import "./oracle/UseOracle.sol";


contract AuctionBoard is
    UseSafeMath,
    AuctionBoardInterface,
    AuctionSecret,
    UseStableCoin,
    UseBondMaker,
    UseAuctionLater
{
    AuctionTimeControlInterface.TimeControlFlag internal constant BEFORE_AUCTION_FLAG = AuctionTimeControlInterface
        .TimeControlFlag
        .BEFORE_AUCTION_FLAG;
    AuctionTimeControlInterface.TimeControlFlag internal constant ACCEPTING_BIDS_PERIOD_FLAG = AuctionTimeControlInterface
        .TimeControlFlag
        .ACCEPTING_BIDS_PERIOD_FLAG;
    AuctionTimeControlInterface.TimeControlFlag internal constant REVEALING_BIDS_PERIOD_FLAG = AuctionTimeControlInterface
        .TimeControlFlag
        .REVEALING_BIDS_PERIOD_FLAG;
    AuctionTimeControlInterface.TimeControlFlag internal constant RECEIVING_SBT_PERIOD_FLAG = AuctionTimeControlInterface
        .TimeControlFlag
        .RECEIVING_SBT_PERIOD_FLAG;
    AuctionTimeControlInterface.TimeControlFlag internal constant AFTER_AUCTION_FLAG = AuctionTimeControlInterface
        .TimeControlFlag
        .AFTER_AUCTION_FLAG;

    uint64 internal constant NO_SKIP_BID = uint64(-1);
    uint64 internal constant SKIP_RECEIVING_WIN_BIDS = uint64(-2);
    uint256 internal immutable MAX_PRICE_INDEX;
    uint256 internal immutable MAX_BOARD_INDEX;
    uint256 internal immutable MAX_BOARD_INDEX_AT_END_PRICE;
    uint256 internal immutable MAX_BIDCOUNT_PER_ADDRESS;
    uint256 internal immutable MIN_TARGET_SBT_AMOUNT;

    /**
     * @notice The stats of the bids in the auction.
     * totalIDOLSecret is the total IDOL amount of unrevealed bids.
     * totalIDOLRevealed is the total IDOL amount of revealed bids.
     * auctionPriceCount is the number of the unique bid price in the auction.
     */
    struct RevealingInfo {
        uint64 totalSBTAmountBid;
        uint64 totalIDOLSecret;
        uint64 totalIDOLRevealed;
        uint16 auctionPriceCount;
    }
    mapping(bytes32 => RevealingInfo) public auctionRevealInfo;

    /**
     * @notice The revealed bids grouped by its price. Each BidInfo has its amount and person who bid.
     * @dev The contents in this internal storage variable can be seen by LogInsertBoard event.
     */
    struct BidInfo {
        uint64 amount;
        address bidder;
    }
    mapping(bytes32 => mapping(uint64 => BidInfo[])) internal _auctionBoard;

    /**
     * @notice The total SBT bid amount at the price in the auction.
     * @dev The contents in this internal storage variable can be seen by getBoardStatus function.
     */
    mapping(bytes32 => mapping(uint64 => uint64)) internal _auctionPrice2TotalSBTAmount;

    /**
     * @notice The information of the person who bid in the auction.
     * auctionLockedIDOLAmountE8 is the total IDOL amount locked for the bid.
     * bidCount is the number of their bids.
     */
    struct ParticipantAmount {
        uint64 auctionLockedIDOLAmountE8;
        uint16 bidCount;
    }
    mapping(bytes32 => mapping(address => ParticipantAmount)) public auctionParticipantInfo;

    /**
     * @dev The contents in this internal storage variable can be seen by getUnsortedBidPrice function.
     */
    mapping(bytes32 => uint64[]) internal _auctionSortedPrice;

    /**
     * @dev The contents in this internal storage variable can be seen by getSortedBidPrice function.
     */
    mapping(bytes32 => uint64[]) internal _auctionUnsortedPrice;

    /**
     * @notice solidStrikePriceIDOLForUnrevealedE8 is the rate of SBT/IDOL for Unrevealed Bids.
     * isEndInfoCreated is the flag that indicates executions of disposeOfUnrevealedBid()
     * in makeEndInfo and giveUpMakeEndInfo.
     * isPriceSorted is the flag that indicates the prices are successfully sorted.
     */
    struct DisposalInfo {
        uint64 solidStrikePriceIDOLForUnrevealedE8;
        uint64 solidStrikePriceIDOLForRestWinnersE8;
        bool isEndInfoCreated;
        bool isForceToFinalizeWinnerAmountTriggered;
        bool isPriceSorted;
    }
    mapping(bytes32 => DisposalInfo) public auctionDisposalInfo;

    /**
     * @notice The indicator for the person who has the lowest winning price (priceIndex, boardIndex),
     * and his losing amount (loseSBTAmount).
     * @dev The contents in this internal storage variable can be seen by getEndInfo function.
     * @param price is the lowest winner price.
     * @param boardIndex is the maximum board index among the winner bids at the lowest price.
     * @param loseSBTAmount is the unsettled amount of the bid at the lowest price and the maximum
     * board index among the winner bids at the price.
     * @param auctionEndPriceWinnerSBTAmount is the total amount of SBTs that have been settled
     * at the lowest winner price.
     */
    struct AuctionWinnerDetInfo {
        uint64 priceIndex;
        uint64 boardIndex;
        uint64 loseSBTAmount;
        uint64 auctionEndPriceWinnerSBTAmount;
    }
    mapping(bytes32 => AuctionWinnerDetInfo) internal _auctionEndInfo;

    struct AuctionInfo {
        uint64 auctionSettledTotalE8;
        uint64 auctionRewardedTotalE8;
        uint64 auctionPaidTotalE8;
    }
    mapping(bytes32 => AuctionInfo) public auctionInfo;

    constructor(
        address bondMakerAddress,
        address IDOLAddress,
        uint16 maxPriceIndex,
        uint64 maxBoardIndex,
        uint64 maxBoardIndexAtEndPrice,
        uint16 maxBidCountPerAddress,
        uint64 minTargetSBTAmount
    ) public UseBondMaker(bondMakerAddress) UseStableCoin(IDOLAddress) {
        MAX_PRICE_INDEX = maxPriceIndex;
        MAX_BOARD_INDEX = maxBoardIndex;
        MAX_BOARD_INDEX_AT_END_PRICE = maxBoardIndexAtEndPrice;
        MAX_BIDCOUNT_PER_ADDRESS = maxBidCountPerAddress;
        MIN_TARGET_SBT_AMOUNT = minTargetSBTAmount;
    }

    /**
     * @notice Secret submission for the auction participation by hash commit.
     * @dev Need to execute ERC20's approve() with IDOL amount
     * (= lambda * SBTstrikePrice * SBTAmount) before this execution.
     * The lambda value equals to the value used in unlockSBT.
     * Hence, even in the same auction, the strike price * lambda may change.
     * In such a case, they may wish to cancel their bid and resend a new one.
     */
    function bidWithMemo(
        bytes32 auctionID,
        bytes32 secret,
        uint64 targetSBTAmount,
        bytes memory memo
    ) public override isNotEmptyAuctionInstance returns (uint256) {
        require(
            _auctionContract.isInPeriod(auctionID, ACCEPTING_BIDS_PERIOD_FLAG),
            "it is not the time to accept bids"
        );

        (, , , , , , , , uint64 highestBidPriceDeadLine, ) = _auctionContract
            .getAuctionStatus(auctionID);

        uint256 depositedIDOLAmount = highestBidPriceDeadLine
            .mul(targetSBTAmount)
            .divRoundUp(10**8);

        require(
            targetSBTAmount >= MIN_TARGET_SBT_AMOUNT,
            "at least 1 SBT is required for the total target bid Amount"
        );

        _bidWithMemo(
            auctionID,
            secret,
            targetSBTAmount,
            depositedIDOLAmount,
            memo
        );

        return depositedIDOLAmount;
    }

    function _bidWithMemo(
        bytes32 auctionID,
        bytes32 secret,
        uint64 targetSBTAmount,
        uint256 depositedIDOLAmount,
        bytes memory memo
    ) internal {
        _transferIDOLFrom(
            msg.sender,
            address(_auctionContract),
            depositedIDOLAmount
        );

        // write secret
        _setSecret(
            auctionID,
            secret,
            msg.sender,
            targetSBTAmount,
            depositedIDOLAmount.toUint64()
        );
        RevealingInfo memory revealInfo = auctionRevealInfo[auctionID];
        revealInfo.totalSBTAmountBid = revealInfo
            .totalSBTAmountBid
            .add(targetSBTAmount)
            .toUint64();
        revealInfo.totalIDOLSecret = revealInfo
            .totalIDOLSecret
            .add(depositedIDOLAmount)
            .toUint64();
        auctionRevealInfo[auctionID] = revealInfo;

        emit LogBidMemo(auctionID, msg.sender, memo);
    }

    function _revealTimeControl(bytes32 auctionID)
        internal
        view
        returns (uint64)
    {
        AuctionTimeControlInterface.TimeControlFlag timeFlag = _auctionContract
            .getTimeControlFlag(auctionID);
        uint64 punishBidPrice;
        if (timeFlag == ACCEPTING_BIDS_PERIOD_FLAG) {
            (, , , , , , , , punishBidPrice, ) = _auctionContract
                .getAuctionStatus(auctionID);
        } else {
            require(
                timeFlag == REVEALING_BIDS_PERIOD_FLAG,
                "it is not the time to reveal the value of bids"
            );
        }
        return punishBidPrice;
    }

    function _registerNewBidPrice(bytes32 auctionID, uint256 price)
        internal
        view
        returns (uint64)
    {
        uint64 bidPrice = price.toUint64();
        (
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            uint64 lowestBidPriceDeadLine,
            uint64 highestBidPriceDeadLine,

        ) = _auctionContract.getAuctionStatus(auctionID);
        if (price > highestBidPriceDeadLine) {
            bidPrice = highestBidPriceDeadLine;
        } else if (price < lowestBidPriceDeadLine) {
            bidPrice = lowestBidPriceDeadLine;
        }

        bidPrice = discretizeBidPrice(bidPrice);

        return bidPrice;
    }

    /**
     * @notice Reveal the bid price publicly.
     * When the bidder publishes their bids earlier than expected by the rule,
     * all people can see the preimage of the bid which can potentially change behaviors of the others,
     * which shuld be prevented.
     * If one submits a valid proof for detecting earlier reveal,
     * the bid price is overwritten by the strike price (slightly unfavored price).
     * Also, if the disclosure is not processed until the deadline, the bid price is considered as
     * a bid with the strike price as well (the process is done in _disposeOfUnrevealedBid()).
     */
    function revealBids(
        bytes32 auctionID,
        uint64[] memory bids,
        uint64 random
    ) public override {
        uint64 bidPrice = _revealTimeControl(auctionID);
        bytes32 secret = generateMultiSecret(auctionID, bids, random);
        Secret memory sec = auctionSecret[auctionID][secret];
        require(sec.sender != address(0), "secret is invalid");
        _removeSecret(auctionID, secret);

        /**
         * @dev bidPrice>0 means the revealing bid is too early and this deserves penalty
         * that forces to bid at strikePrice.
         */
        uint256 targetSBTAmount;

        if (bidPrice != 0) {
            uint64[] memory punishBid = new uint64[](2);
            punishBid[0] = bidPrice;
            punishBid[1] = sec.amount;
            targetSBTAmount = _revealBids(
                auctionID,
                sec.sender,
                punishBid,
                sec.IDOLamount
            );
        } else {
            targetSBTAmount = _revealBids(
                auctionID,
                sec.sender,
                bids,
                sec.IDOLamount
            );
        }

        require(
            targetSBTAmount == sec.amount,
            "the total SBT amount info needs to be the same with that of secret."
        );
    }

    function _revealBids(
        bytes32 auctionID,
        address bidder,
        uint64[] memory bids,
        uint64 strikePriceIDOLAmount
    ) internal returns (uint64 targetSBTAmount) {
        {

                ParticipantAmount memory participantInfo
             = auctionParticipantInfo[auctionID][bidder];
            participantInfo.auctionLockedIDOLAmountE8 = participantInfo
                .auctionLockedIDOLAmountE8
                .add(strikePriceIDOLAmount)
                .toUint64();
            participantInfo.bidCount = participantInfo
                .bidCount
                .add(bids.length.div(2))
                .toUint16();
            auctionParticipantInfo[auctionID][bidder] = participantInfo;
            require(
                participantInfo.bidCount <= MAX_BIDCOUNT_PER_ADDRESS,
                "the max bid count per addres exceeded 100"
            );
        }

        RevealingInfo memory revealInfo = auctionRevealInfo[auctionID];
        for (uint256 i = 0; i < bids.length; i += 2) {
            uint64 bidPrice = _registerNewBidPrice(auctionID, bids[i]);

            {
                // If the auctionBoard does not have the same price, increment the count of price.
                uint256 nextBoardIndex = _auctionBoard[auctionID][bidPrice]
                    .length;
                require(nextBoardIndex <= MAX_BOARD_INDEX, "too many bids");
                if (nextBoardIndex == 0) {
                    uint256 nextPriceIndex = _auctionUnsortedPrice[auctionID]
                        .length;
                    require(
                        nextPriceIndex <= MAX_PRICE_INDEX,
                        "price range exceeded"
                    );
                    _auctionUnsortedPrice[auctionID].push(bidPrice);
                    revealInfo.auctionPriceCount = revealInfo
                        .auctionPriceCount
                        .add(1)
                        .toUint16();
                }
            }

            uint64 SBTAmount = bids[i + 1];

            require(
                SBTAmount >= MIN_TARGET_SBT_AMOUNT,
                "at least 1 SBT is required for the target bid Amount"
            );

            emit LogInsertBoard(
                auctionID,
                bidder,
                bidPrice,
                _auctionBoard[auctionID][bidPrice].length.toUint64(),
                SBTAmount
            );

            _auctionBoard[auctionID][bidPrice].push(BidInfo(SBTAmount, bidder));
            _auctionPrice2TotalSBTAmount[auctionID][bidPrice] = _auctionPrice2TotalSBTAmount[auctionID][bidPrice]
                .add(SBTAmount)
                .toUint64();

            targetSBTAmount = targetSBTAmount.add(SBTAmount).toUint64();
        }

        revealInfo.totalIDOLRevealed = revealInfo
            .totalIDOLRevealed
            .add(strikePriceIDOLAmount)
            .toUint64();
        auctionRevealInfo[auctionID] = revealInfo;
    }

    /**
     * @notice Create the sorted bid price data outside the contract, and check if it is correctly
     * sorted from highest to lowest.
     * @dev This is because creating a hash table for bids by sort will significantly increase the
     * cost of gas.
     */
    function sortBidPrice(bytes32 auctionID, uint64[] memory sortedPrice)
        public
        override
        isNotEmptyAuctionInstance
    {
        uint16 bidsCount = sortedPrice.length.toUint16();

        require(
            _auctionContract.isAfterPeriod(
                auctionID,
                RECEIVING_SBT_PERIOD_FLAG
            ),
            "it is not the time to insert the price data"
        );
        require(
            bidsCount == auctionRevealInfo[auctionID].auctionPriceCount,
            "the number of unique prices is invalid"
        );

        if (bidsCount == 1) {
            require(
                _auctionBoard[auctionID][sortedPrice[0]].length != 0,
                "no order exists at the price"
            );
            _auctionSortedPrice[auctionID] = sortedPrice;
            delete _auctionUnsortedPrice[auctionID];
        } else if (bidsCount != 0) {
            // Large/small check for each price (large-> small)
            for (uint16 i = 0; i < bidsCount - 1; i++) {
                uint64 current = sortedPrice[i];
                uint64 next = sortedPrice[i + 1];
                require(current > next, "sortedPrice is not sorted correctly");
                require(
                    _auctionBoard[auctionID][current].length != 0,
                    "no order exists at the price"
                );
            }

            require(
                _auctionBoard[auctionID][sortedPrice[bidsCount - 1]].length !=
                    0,
                "no order exists at the price"
            );

            // Completion of sorted bid price data
            _auctionSortedPrice[auctionID] = sortedPrice;
            delete _auctionUnsortedPrice[auctionID];
        }

        // Initialize bidIndex to 0. Used in the following endAuction process.
        auctionDisposalInfo[auctionID].isPriceSorted = true;
    }

    /**
     * @notice Unrevealed secret is punished.
     * The total locked IDOL is exchanged for the SBT (the penalty fee is very small in general).
     */
    function _disposeOfUnrevealedBid(bytes32 auctionID) internal {
        DisposalInfo memory disposalInfo = auctionDisposalInfo[auctionID];

        RevealingInfo memory revealInfo = auctionRevealInfo[auctionID];

        require(
            !disposalInfo.isEndInfoCreated,
            "This Function should be triggered only once"
        );
        require(
            disposalInfo.isPriceSorted,
            "Prices need to be sorted before the execution of _disposeOfUnrevealedBid"
        );
        (
            address bondTokenAddress,
            ,
            uint256 solidStrikePriceE4,

        ) = _getBondFromAuctionID(auctionID); // strikePrice in IDOL unit
        require(bondTokenAddress != address(0), "the bond is not registered");

        // calcSBT2IDOL executes the multiplication of lambda to the strike price
        uint256 solidStrikePriceIDOL = _IDOLContract.calcSBT2IDOL(
            solidStrikePriceE4.mul(10**8)
        );

        // (total target) - (total revealed) = (total unrevealed)
        uint256 IDOLAmountUnrevealedBid = revealInfo.totalIDOLSecret.sub(
            revealInfo.totalIDOLRevealed
        );
        uint256 totalSBTAmountE8 = IDOLAmountUnrevealedBid.mul(10**8).div(
            solidStrikePriceIDOL,
            "system error: SBT strike price should not be zero value"
        );

        {
            uint64 ongoingAmount = _auctionContract.ongoingAuctionSBTTotal(
                auctionID
            );
            if (totalSBTAmountE8 > ongoingAmount) {
                totalSBTAmountE8 = ongoingAmount;
                IDOLAmountUnrevealedBid = totalSBTAmountE8
                    .mul(solidStrikePriceIDOL)
                    .div(10**8);
            }
        }

        disposalInfo.solidStrikePriceIDOLForUnrevealedE8 = solidStrikePriceIDOL
            .toUint64();

        // It is necessary to atomically burn IDOL and to return SBT in order to keep the lambda value consistent.
        _updateAuctionInfo(
            auctionID,
            totalSBTAmountE8.toUint64(),
            IDOLAmountUnrevealedBid.toUint64(),
            totalSBTAmountE8.toUint64()
        );
        disposalInfo.isEndInfoCreated = true;
        auctionDisposalInfo[auctionID] = disposalInfo;
    }

    function makeEndInfo(bytes32 auctionID)
        public
        override
        isNotEmptyAuctionInstance
    {
        _disposeOfUnrevealedBid(auctionID);

        AuctionTimeControlInterface.TimeControlFlag timeFlag = _auctionContract
            .getTimeControlFlag(auctionID);
        if (timeFlag == RECEIVING_SBT_PERIOD_FLAG) {
            _makeAuctionEndInfo(auctionID);
            return;
        }

        require(
            timeFlag > RECEIVING_SBT_PERIOD_FLAG,
            "it is not the time to receive winning SBT"
        );
        _giveUpMakeAuctionEndInfo(auctionID);
    }

    /**
     * @notice only decides the lowest winning price, and let each winner calculate their own winning amount in a different function.
     * This function still works even when the network is too crowded.
     * This is different from endAuction, which decides both all the winning amounts per winner and the lowest winning price,
     * but endAuction cannot work when the network is too crowded.
     */
    function _makeAuctionEndInfo(bytes32 auctionID) internal {
        if (_auctionSortedPrice[auctionID].length == 0) {
            return;
        }

        uint256 winnerAmountCount = 0;

        uint64 ongoingAmount = _auctionContract.ongoingAuctionSBTTotal(
            auctionID
        );
        uint256 SBTAuctionTotal = ongoingAmount.sub(
            auctionInfo[auctionID].auctionSettledTotalE8,
            "system error: settled amount exceeds auction amount"
        );

        uint256 SBTAmountAtLowestWinnerPrice;
        uint256 lowestWinnerPriceIndex;
        uint256 price;
        bool endFlag = false;
        for (uint256 i = 0; i < _auctionSortedPrice[auctionID].length; i++) {
            price = _auctionSortedPrice[auctionID][i];
            uint256 SBTAmount = _auctionPrice2TotalSBTAmount[auctionID][price
                .toUint64()];
            uint256 diffAmount = SBTAuctionTotal.sub(winnerAmountCount);
            lowestWinnerPriceIndex = i;
            if (SBTAmount > diffAmount) {
                SBTAmountAtLowestWinnerPrice = diffAmount;
                endFlag = true;
                break;
            }

            winnerAmountCount = winnerAmountCount.add(SBTAmount);

            if (SBTAmount == diffAmount) {
                break;
            }
        }

        /**
         * @dev For the case that the total bid amount is less than the total SBT amount put up in the auction,
         * all the bids result in buying SBT.
         */
        if (!endFlag) {
            AuctionWinnerDetInfo memory endInfo = AuctionWinnerDetInfo(
                lowestWinnerPriceIndex.toUint64(),
                (_auctionBoard[auctionID][price.toUint64()].length - 1)
                    .toUint64(),
                0,
                _auctionPrice2TotalSBTAmount[auctionID][price.toUint64()]
            );
            _auctionEndInfo[auctionID] = endInfo;
            auctionInfo[auctionID]
                .auctionSettledTotalE8 = auctionInfo[auctionID]
                .auctionSettledTotalE8
                .add(winnerAmountCount)
                .toUint64();
            return;
        }

        SBTAuctionTotal = winnerAmountCount; // [WARNING] here we are using SBTAuctionTotal for another purpose to avoid Stack too deep
        winnerAmountCount = 0;

        for (uint256 j = 0; j <= MAX_BOARD_INDEX_AT_END_PRICE; j++) {

                uint256 bidPrice
             = _auctionSortedPrice[auctionID][lowestWinnerPriceIndex];

            // j is guaranteed to be less than _auctionBoard[auctionID][bidPrice.toUint64()].length
            // because of the check of total SBT amount at the end of the loop above.
            BidInfo memory bidInfo = _auctionBoard[auctionID][bidPrice
                .toUint64()][j];
            uint256 diffAmount = SBTAmountAtLowestWinnerPrice.sub(
                winnerAmountCount
            );
            winnerAmountCount = winnerAmountCount.add(bidInfo.amount);

            if (bidInfo.amount >= diffAmount) {
                uint256 loseSBTAmount = bidInfo.amount.sub(diffAmount);
                _auctionEndInfo[auctionID] = AuctionWinnerDetInfo(
                    lowestWinnerPriceIndex.toUint64(),
                    j.toUint64(),
                    loseSBTAmount.toUint64(),
                    SBTAmountAtLowestWinnerPrice.toUint64()
                );
                winnerAmountCount = winnerAmountCount.sub(loseSBTAmount);
                break;
            } else if (j == MAX_BOARD_INDEX_AT_END_PRICE) {
                /**
                 * @dev For spam protection, we stop summing up the winning bid at the lowest winning price.
                 * In this case, the second aucion will be held.
                 */
                _auctionEndInfo[auctionID] = AuctionWinnerDetInfo(
                    lowestWinnerPriceIndex.toUint64(),
                    j.toUint64(),
                    0,
                    winnerAmountCount.toUint64()
                );
            }
        }
        auctionInfo[auctionID].auctionSettledTotalE8 = auctionInfo[auctionID]
            .auctionSettledTotalE8
            .add(SBTAuctionTotal.add(winnerAmountCount))
            .toUint64();
    }

    function _giveUpMakeAuctionEndInfo(bytes32 auctionID) internal {
        if (_auctionSortedPrice[auctionID].length != 0) {
            uint64 highestBidPrice = _auctionSortedPrice[auctionID][0];

            if (_auctionBoard[auctionID][highestBidPrice].length != 0) {
                _auctionEndInfo[auctionID]
                    .loseSBTAmount = _auctionBoard[auctionID][highestBidPrice][0]
                    .amount;
            }
        }
    }

    function calcBill(
        bytes32 auctionID,
        uint64 winnerAmount,
        uint64 myLowestPrice
    ) public override view isNotEmptyAuctionInstance returns (uint64) {
        AuctionWinnerDetInfo memory endInfo = _auctionEndInfo[auctionID];

        uint256 toPayPlusSkip = 0;
        bool myLowestVerify = false;
        uint256 restWinnerAmount = winnerAmount;

        // Here we start the counting of the payment by using winnerAmount and Loser Bid Prices.
        // At this moment, winnerAmount includes losing amount for optimizing calculation.
        // Verifying the loser bids (function input) is also required after this loop.
        for (
            uint256 i = endInfo.priceIndex;
            i < _auctionSortedPrice[auctionID].length;
            i++
        ) {
            uint64 price = _auctionSortedPrice[auctionID][i];
            uint64 SBTAmount = _auctionPrice2TotalSBTAmount[auctionID][price];
            if (price <= myLowestPrice) {
                myLowestVerify = true;
            }

            if (i == endInfo.priceIndex) {
                // losing SBT amount at the lowest winning price (the highest losing price)
                SBTAmount = SBTAmount
                    .sub(endInfo.auctionEndPriceWinnerSBTAmount)
                    .toUint64();
            }

            if (restWinnerAmount > SBTAmount) {
                toPayPlusSkip = toPayPlusSkip.add(
                    SBTAmount.mul(price).divRoundUp(10**8)
                );
                restWinnerAmount = restWinnerAmount.sub(SBTAmount);
            } else {
                toPayPlusSkip = toPayPlusSkip.add(
                    restWinnerAmount.mul(price).divRoundUp(10**8)
                );
                restWinnerAmount = 0;
                break;
            }
        }

        if (myLowestPrice != NO_SKIP_BID) {
            require(
                myLowestVerify,
                "myLowestVerify is false: incorrect input :[myLowestPrice]3"
            );
        }

        (, , , , , , , uint256 lowestBidPriceDeadLine, , ) = _auctionContract
            .getAuctionStatus(auctionID);
        toPayPlusSkip = toPayPlusSkip.add(
            restWinnerAmount.mul(lowestBidPriceDeadLine).divRoundUp(10**8)
        );

        return toPayPlusSkip.toUint64();
    }

    /**
     * @notice In this auction process, all the bids are secretly submitted, and are revealed later on.
     * This function provides the form of hash commit.
     */
    function generateMultiSecret(
        bytes32 auctionID,
        uint64[] memory bids,
        uint64 random
    ) public override pure returns (bytes32 secret) {
        secret = keccak256(abi.encodePacked(auctionID, bids, random));
    }

    function deleteParticipantInfo(bytes32 auctionID, address participant)
        public
        isNotEmptyAuctionInstance
    {
        require(
            msg.sender == address(_auctionContract),
            "only auction contract allow to invoke deleteParticipantInfo"
        );
        delete auctionParticipantInfo[auctionID][participant];
    }

    /**
     * @dev This function returns the price rounded off to the top 3 digits.
     */
    function discretizeBidPrice(uint64 priceE8)
        public
        override
        pure
        returns (uint64)
    {
        if (priceE8 < 5 * 10**8) {
            return priceE8.div(10**5).mul(10**5).toUint64();
        } else if (priceE8 < 5 * 10**9) {
            return priceE8.div(10**6).mul(10**6).toUint64();
        } else if (priceE8 < 5 * 10**10) {
            return priceE8.div(10**7).mul(10**7).toUint64();
        } else if (priceE8 < 5 * 10**11) {
            return priceE8.div(10**8).mul(10**8).toUint64();
        } else if (priceE8 < 5 * 10**12) {
            return priceE8.div(10**9).mul(10**9).toUint64();
        } else if (priceE8 < 5 * 10**13) {
            return priceE8.div(10**10).mul(10**10).toUint64();
        } else if (priceE8 < 5 * 10**14) {
            return priceE8.div(10**11).mul(10**11).toUint64();
        } else {
            return priceE8.div(10**12).mul(10**12).toUint64();
        }
    }

    function updateAuctionInfo(
        bytes32 auctionID,
        uint64 settledAmountE8,
        uint64 paidIDOLE8,
        uint64 rewardedSBTE8
    ) external isNotEmptyAuctionInstance {
        require(
            msg.sender == address(_auctionContract),
            "only auction contract is allowed to invoke updateAuctionInfo"
        );
        _updateAuctionInfo(
            auctionID,
            settledAmountE8,
            paidIDOLE8,
            rewardedSBTE8
        );
    }

    /**
     *@notice updates AuctionInfo structure simultineously to make gas cheaper.
     */
    function _updateAuctionInfo(
        bytes32 auctionID,
        uint64 settledAmountE8,
        uint64 paidIDOLE8,
        uint64 rewardedSBTE8
    ) internal {
        AuctionInfo memory _auctionInfo = auctionInfo[auctionID];
        _auctionInfo.auctionSettledTotalE8 = _auctionInfo
            .auctionSettledTotalE8
            .add(settledAmountE8)
            .toUint64();
        // Calculate the cumulative amount of IDOL that is already paid and not to be returned.
        _auctionInfo.auctionPaidTotalE8 = _auctionInfo
            .auctionPaidTotalE8
            .add(paidIDOLE8)
            .toUint64();
        // Calculate the cumulative amount of SBT that is already decided to be distributed.
        _auctionInfo.auctionRewardedTotalE8 = _auctionInfo
            .auctionRewardedTotalE8
            .add(rewardedSBTE8)
            .toUint64();
        auctionInfo[auctionID] = _auctionInfo;
        emit LogAuctionInfoDiff(
            auctionID,
            settledAmountE8,
            paidIDOLE8,
            rewardedSBTE8
        );
    }

    /**
     * @dev get the bond information from the auctionID
     */
    function _getBondFromAuctionID(bytes32 auctionID)
        internal
        view
        returns (
            address erc20Address,
            uint256 maturity,
            uint64 solidStrikePrice,
            bytes32 fnMapID
        )
    {
        bytes32 bondID = _auctionContract.auctionID2BondID(auctionID);
        return _bondMakerContract.getBond(bondID);
    }

    /**
     * @notice this function is a view fuction for client side. The return value of this will be used and verified in makeAuctionResult.
     */
    function calcMyLowestPrice(
        bytes32 auctionID,
        uint64 winnerAmount,
        uint64[] calldata myLoseBids
    ) external view returns (uint64 myLowestPrice) {
        AuctionWinnerDetInfo memory endInfo = _auctionEndInfo[auctionID];
        myLowestPrice = uint64(-1);
        if (winnerAmount == 0) {
            return myLowestPrice;
        }

        uint256 restWinnerAmount = winnerAmount;
        uint256 myLoseBidsIndex = 0;
        for (
            uint256 priceIndex = endInfo.priceIndex;
            priceIndex < _auctionSortedPrice[auctionID].length;
            priceIndex++
        ) {
            uint64 price = _auctionSortedPrice[auctionID][priceIndex];


                uint64 totalSBTAmount
             = _auctionPrice2TotalSBTAmount[auctionID][price];

            if (priceIndex == endInfo.priceIndex) {
                // losing SBT amount at the lowest winning price (the highest losing price)
                if (totalSBTAmount == endInfo.auctionEndPriceWinnerSBTAmount) {
                    continue;
                }
                totalSBTAmount = totalSBTAmount
                    .sub(endInfo.auctionEndPriceWinnerSBTAmount)
                    .toUint64();
            }

            while (
                myLoseBidsIndex + 1 < myLoseBids.length &&
                myLoseBids[myLoseBidsIndex] == price
            ) {
                if (
                    priceIndex == endInfo.priceIndex &&
                    myLoseBids[myLoseBidsIndex + 1] == endInfo.boardIndex
                ) {
                    if (endInfo.loseSBTAmount != 0) {
                        restWinnerAmount = restWinnerAmount.add(
                            endInfo.loseSBTAmount
                        );
                        myLowestPrice = price;
                    }
                } else {

                        BidInfo memory bidInfo
                     = _auctionBoard[auctionID][price][myLoseBids[myLoseBidsIndex +
                        1]];
                    restWinnerAmount = restWinnerAmount.add(bidInfo.amount);
                    myLowestPrice = price;
                }
                myLoseBidsIndex += 2;
            }

            if (restWinnerAmount > totalSBTAmount) {
                restWinnerAmount = restWinnerAmount.sub(totalSBTAmount);
            } else {
                restWinnerAmount = 0;
                break;
            }
        }
    }

    /**
     * @notice removeSecret is only allowed by Auction Contract cancelBid function.
     */
    function removeSecret(
        bytes32 auctionID,
        bytes32 secret,
        uint64 subtractAmount
    ) external isNotEmptyAuctionInstance {
        require(
            msg.sender == address(_auctionContract),
            "only auction contract is allowed to invoke removeSecret"
        );
        _removeSecret(auctionID, secret);
        if (subtractAmount != 0) {
            RevealingInfo storage revealInfo = auctionRevealInfo[auctionID];
            revealInfo.totalIDOLSecret = revealInfo
                .totalIDOLSecret
                .sub(subtractAmount)
                .toUint64();
        }
    }

    /**
     * Functions bellow are view functions.
     */

    function auctionBoard(
        bytes32 auctionID,
        uint64 bidPrice,
        uint256 boardIndex
    ) public view returns (uint64 amount, address bidder) {
        require(
            boardIndex < _auctionBoard[auctionID][bidPrice].length,
            "out of index"
        );


            BidInfo storage bidInfo
         = _auctionBoard[auctionID][bidPrice][boardIndex];
        return (bidInfo.amount, bidInfo.bidder);
    }

    function getUnsortedBidPrice(bytes32 auctionID)
        external
        override
        view
        returns (uint64[] memory)
    {
        return _auctionUnsortedPrice[auctionID];
    }

    function getSortedBidPrice(bytes32 auctionID)
        external
        override
        view
        returns (uint64[] memory)
    {
        return _auctionSortedPrice[auctionID];
    }

    /**
     * @param auctionID is an auction ID.
     * @return price is the lowest winner price.
     * @return boardIndex is the maximum board index among the winner bids at the lowest price.
     * @return loseSBTAmount is the unsettled amount of the bid at the lowest price and the maximum
     * board index among the winner bids at the price.
     * @return auctionEndPriceWinnerSBTAmount is the total amount of SBTs that have been settled
     * at the lowest winner price.
     */
    function getEndInfo(bytes32 auctionID)
        external
        override
        view
        returns (
            uint64 price,
            uint64 boardIndex,
            uint64 loseSBTAmount,
            uint64 auctionEndPriceWinnerSBTAmount
        )
    {
        AuctionWinnerDetInfo memory endInfo = _auctionEndInfo[auctionID];
        if (!auctionDisposalInfo[auctionID].isEndInfoCreated) {
            // before executing makeEndInfo
            return (0, 0, 0, 0);
        }
        if (_auctionSortedPrice[auctionID].length == 0) {
            // no revealed bid
            return (0, 0, 0, 0);
        }

        // This function does not return the initial value of AuctionWinnerDetInfo except for the two cases above.

        price = _auctionSortedPrice[auctionID][endInfo.priceIndex];
        boardIndex = endInfo.boardIndex;
        loseSBTAmount = endInfo.loseSBTAmount;
        auctionEndPriceWinnerSBTAmount = endInfo.auctionEndPriceWinnerSBTAmount;
        require(
            !(price == 0 &&
                boardIndex == 0 &&
                loseSBTAmount == 0 &&
                auctionEndPriceWinnerSBTAmount == 0),
            "system error: the end info should not be initial value"
        );
    }

    function getBidderStatus(bytes32 auctionID, address bidder)
        external
        override
        view
        returns (uint64 toBack, bool isIDOLReturned)
    {
        toBack = auctionParticipantInfo[auctionID][bidder]
            .auctionLockedIDOLAmountE8;
        isIDOLReturned = (toBack != 0);
    }

    function getBoard(
        bytes32 auctionID,
        uint64 price,
        uint64 boardIndex
    ) external override view returns (address bidder, uint64 amount) {
        BidInfo memory bidInfo = _auctionBoard[auctionID][price][boardIndex];
        return (bidInfo.bidder, bidInfo.amount);
    }

    function getBoardStatus(bytes32 auctionID)
        external
        override
        view
        returns (uint64[] memory boardStatus)
    {
        uint256 priceCount = _auctionSortedPrice[auctionID].length;
        boardStatus = new uint64[](priceCount);
        for (uint256 i = 0; i < priceCount; i++) {
            uint64 price = _auctionSortedPrice[auctionID][i];
            boardStatus[i] = _auctionPrice2TotalSBTAmount[auctionID][price];
        }
    }
}

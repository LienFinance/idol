pragma solidity 0.6.6;

import "../node_modules/@openzeppelin/contracts/math/Math.sol";
import "./math/UseSafeMath.sol";
import "./AuctionInterface.sol";
import "./AuctionTimeControl.sol";
import "./UseBondMaker.sol";
import "./UseStableCoin.sol";
import "./UseAuctionBoard.sol";
import "./oracle/UseOracle.sol";
import "./bondToken/BondTokenInterface.sol";


contract Auction is
    UseSafeMath,
    AuctionInterface,
    AuctionTimeControl,
    UseStableCoin,
    UseBondMaker,
    UseAuctionBoard
{
    using Math for uint256;

    uint64 internal constant NO_SKIP_BID = uint64(-1);
    uint64 internal constant SKIP_RECEIVING_WIN_BIDS = uint64(-2);
    uint256 internal constant POOL_AUCTION_COUNT_PADDING = 10**8;

    /**
     * @notice The times of auctions held for the auction ID.
     * @dev The contents in this internal storage variable can be seen by getAuctionCount function.
     */
    mapping(bytes32 => uint256) internal _bondIDAuctionCount;

    /**
     * @notice Get the bond ID from the auction ID.
     */
    mapping(bytes32 => bytes32) public auctionID2BondID;

    /**
     * @dev The contents in this internal storage variable can be seen by getAuctionStatus function.
     * @param ongoingAuctionSBTTotalE8 is the SBT amount put up in the auction.
     * @param lowestBidPriceDeadLineE8 is the minimum bid price in the auction.
     * @param highestBidPriceDeadLineE8 is the maximum bid price in the auction.
     * @param totalSBTAmountPaidForUnrevealedE8 is the SBT Amount allocated for those who had not revealed their own bid.
     */
    struct AuctionConfig {
        uint64 ongoingAuctionSBTTotalE8;
        uint64 lowestBidPriceDeadLineE8;
        uint64 highestBidPriceDeadLineE8;
        uint64 totalSBTAmountPaidForUnrevealedE8;
    }
    mapping(bytes32 => AuctionConfig) internal _auctionConfigList;

    constructor(
        address bondMakerAddress,
        address IDOLAddress,
        address auctionBoardAddress,
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
        UseBondMaker(bondMakerAddress)
        UseStableCoin(IDOLAddress)
        UseAuctionBoard(auctionBoardAddress)
    {}

    /**
     * @dev This function starts the auction for the auctionID. Can be called only by the IDOL contract.
     */
    function startAuction(
        bytes32 bondID,
        uint64 auctionAmount,
        bool isEmergency
    ) external override returns (bytes32) {
        require(
            msg.sender == address(_IDOLContract),
            "caller must be IDOL contract"
        );
        return _startAuction(bondID, auctionAmount, isEmergency);
    }

    /**
     * @notice This function is called when the auction (re)starts.
     * @param bondID is SBT ID whose auction will be held.
     * @param auctionAmount is SBT amount put up in the auction.
     * @param isEmergency is the flag that indicates the auction schedule is for emergency mode.
     */
    function _startAuction(
        bytes32 bondID,
        uint64 auctionAmount,
        bool isEmergency
    ) internal returns (bytes32) {
        (, , uint256 solidStrikePriceE4, ) = _bondMakerContract.getBond(bondID);
        uint256 strikePriceIDOL = _IDOLContract.calcSBT2IDOL(
            solidStrikePriceE4.mul(10**8)
        );

        uint256 auctionCount = _bondIDAuctionCount[bondID].add(1);
        _bondIDAuctionCount[bondID] = auctionCount;
        bytes32 auctionID = getCurrentAuctionID(bondID);
        require(
            isInPeriod(auctionID, BEFORE_AUCTION_FLAG),
            "the auction has been held"
        );

        uint256 betaCount = auctionCount.mod(POOL_AUCTION_COUNT_PADDING).min(9);

        auctionID2BondID[auctionID] = bondID;

        _setAuctionClosingTime(auctionID, isEmergency);

        {
            AuctionConfig memory auctionConfig = _auctionConfigList[auctionID];
            auctionConfig.ongoingAuctionSBTTotalE8 = auctionAmount;
            auctionConfig.lowestBidPriceDeadLineE8 = strikePriceIDOL
                .mul(10 - betaCount)
                .div(10)
                .toUint64();
            auctionConfig.highestBidPriceDeadLineE8 = strikePriceIDOL
                .mul(10 + betaCount)
                .div(10)
                .toUint64();
            _auctionConfigList[auctionID] = auctionConfig;
        }

        emit LogStartAuction(auctionID, bondID);

        return auctionID;
    }

    /**
     * @notice submit only your own winning bids and get SBT amount which you'll aquire.
     */
    function calcWinnerAmount(
        bytes32 auctionID,
        address sender,
        uint64[] memory winnerBids
    ) public override view returns (uint64) {
        uint256 totalBidAmount;

        (
            uint64 endPrice,
            uint64 endBoardIndex,
            uint64 loseSBTAmount,

        ) = _auctionBoardContract.getEndInfo(auctionID);

        uint64 bidPrice;
        uint64 boardIndex;
        // can calculate winner amount after making the end info.
        {
            (, , bool isEndInfoCreated, , ) = _auctionBoardContract
                .auctionDisposalInfo(auctionID);
            require(isEndInfoCreated, "the end info has not been made yet");
        }

        for (uint256 i = 0; i < winnerBids.length; i += 2) {
            if (i != 0) {
                require(
                    bidPrice > winnerBids[i] ||
                        (bidPrice == winnerBids[i] &&
                            boardIndex < winnerBids[i + 1]),
                    "loser Bids are not sorted."
                );
            }
            bidPrice = winnerBids[i];
            boardIndex = winnerBids[i + 1];
            (uint64 bidAmount, address bidder) = _auctionBoardContract
                .auctionBoard(auctionID, bidPrice, boardIndex);
            require(bidder == sender, "this bid is not yours");

            totalBidAmount = totalBidAmount.add(bidAmount);
            if (endPrice == bidPrice) {
                if (boardIndex == endBoardIndex) {
                    totalBidAmount = totalBidAmount.sub(loseSBTAmount);
                } else {
                    require(
                        boardIndex < endBoardIndex,
                        "this bid does not win"
                    );
                }
            } else {
                require(endPrice < bidPrice, "this bid does not win");
            }
        }

        return totalBidAmount.toUint64();
    }

    /**
     * @notice all loser bids must be reported to this function. These are checked and counted for calculations of bill.
     * @param auctionID aunctionID
     * @param sender owner of the bids
     * @param winnerAmountInput SBT amount to aquire. this is needed because this effect the price of SBT in Vickly Auction's protocol.
     * @param myLowestPrice myLowestPrice is the lowest price of skip bids.
     * @param myLoseBids is the all bids which is after the endInfo
     */
    function calcBillAndCheckLoserBids(
        bytes32 auctionID,
        address sender,
        uint64 winnerAmountInput,
        uint64 myLowestPrice,
        uint64[] memory myLoseBids
    ) public override view returns (uint64) {
        uint256 winnerAmount = winnerAmountInput;
        uint256 toPaySkip = 0;

        if (
            myLowestPrice != NO_SKIP_BID &&
            myLowestPrice != SKIP_RECEIVING_WIN_BIDS
        ) {
            bool myLowestVerify = false;
            for (uint256 i = 0; i < myLoseBids.length; i += 2) {
                uint64 price = myLoseBids[i];
                if (price == myLowestPrice) {
                    myLowestVerify = true;
                    break;
                }
            }

            require(
                myLowestVerify,
                "myLowestPrice must be included in myLoseBids"
            );
        }

        // The amount of sender's lose bids will be skipped. In order to optimize the calculation,
        // components in myLoseBids with a higher price than myLowestPrice are added to winnerAmount and
        // to be subtracted at the end of this function.
        for (uint256 i = 0; i < myLoseBids.length; i += 2) {
            uint64 price = myLoseBids[i];
            uint64 boardIndex = myLoseBids[i + 1];

            if (i != 0) {
                require(
                    price < myLoseBids[i - 2] ||
                        (price == myLoseBids[i - 2] &&
                            boardIndex > myLoseBids[i - 1]),
                    "myLoseBids is not sorted"
                );
            }
            {
                (
                    uint64 endPrice,
                    uint64 endBoardIndex,
                    uint64 loseSBTAmount,

                ) = _auctionBoardContract.getEndInfo(auctionID);

                if (price == endPrice) {
                    if (boardIndex == endBoardIndex) {
                        require(
                            loseSBTAmount != 0,
                            "myLoseBids includes the bid which is same as endInfo with no lose SBT amount"
                        );

                        // This function does not guarantee to return the correct result if an invalid input is given,
                        // because this function can be used just for getting information.
                        // This function is used in the procecss of makeAuctionResult(), and in such a case,
                        // all the verification for bidder==sender and some necessary conditions are processed
                        // in different functions.

                        if (myLowestPrice <= price) {
                            winnerAmount = winnerAmount.add(loseSBTAmount);
                            toPaySkip = toPaySkip.add(
                                price.mul(loseSBTAmount).div(10**8)
                            );
                            continue;
                        }
                    } else {
                        require(
                            boardIndex > endBoardIndex,
                            "myLoseBids includes the bid whose bid index is less than that of endInfo"
                        );
                    }
                } else {
                    require(
                        price < endPrice,
                        "myLoseBids includes the bid whose price is more than that of endInfo"
                    );
                }
            }

            (uint64 bidAmount, address bidder) = _auctionBoardContract
                .auctionBoard(auctionID, price, boardIndex);
            require(
                bidder == sender,
                "myLoseBids includes the bid whose owner is not the sender"
            );

            if (myLowestPrice <= price) {
                winnerAmount = winnerAmount.add(bidAmount);
                toPaySkip = toPaySkip.add(price.mul(bidAmount).div(10**8));
            }
        }

        if (myLowestPrice == SKIP_RECEIVING_WIN_BIDS) {
            // Reduce calculation costs instead by receiving obtained SBT at the highest losing price.
            (uint64 endPrice, , , ) = _auctionBoardContract.getEndInfo(
                auctionID
            );
            //while toPaySkip is expected to be zero in the loop above,
            //only the exception is when the the price acctually hit uint64(-1) at an extremely unexpected case.
            return
                endPrice
                    .mul(winnerAmount)
                    .divRoundUp(10**8)
                    .sub(toPaySkip)
                    .toUint64();
        }

        return
            _auctionBoardContract
                .calcBill(auctionID, winnerAmount.toUint64(), myLowestPrice)
                .sub(toPaySkip)
                .toUint64();
    }

    /**
     * @notice Submit all my win and lose bids, verify them, and transfer the auction reward.
     * @param winnerBids is an array of alternating price and board index.
     * For example, if the end info is { price: 96, boardIndex: 0, loseSBTAmount: 100000000 } and you have 3 bids:
     * { price: 99, boardIndex: 0 }, { price: 97, boardIndex: 2 }, and { price: 96, boardIndex: 1 },
     * you should submit [9900000000, 0, 9700000000, 2] as winnerBids and [9600000000, 1] as loserBids.
     * If the end info is { price: 96, boardIndex: 0, loseSBTAmount: 100000000 } and you have 1 bid:
     * { price: 96, boardIndex: 0 }, you should submit [9600000000, 0] as winnerBids and [9600000000, 0]
     * as loserBids.
     */
    function makeAuctionResult(
        bytes32 auctionID,
        uint64 myLowestPrice,
        uint64[] memory winnerBids,
        uint64[] memory loserBids
    )
        public
        override
        returns (
            uint64,
            uint64,
            uint64
        )
    {
        (
            uint64 auctionLockedIDOLAmountE8,
            uint16 bidCount
        ) = _auctionBoardContract.auctionParticipantInfo(auctionID, msg.sender);

        require(auctionLockedIDOLAmountE8 != 0, "This process is already done");

        {
            (
                uint64 endPrice,
                uint64 endBoardIndex,
                uint64 loseSBTAmount,
                uint64 auctionEndPriceWinnerSBTAmount
            ) = _auctionBoardContract.getEndInfo(auctionID);
            (address endBidder, ) = _auctionBoardContract.getBoard(
                auctionID,
                endPrice,
                endBoardIndex
            );
            // If dupicated bid count is included (loseSBTAmount != 0), bidCount is increased by 1.
            // When both auctionEndPriceWinnerSBTAmount and loseSBTAmount are no-zero value,
            // the end info bid has two components(a winner bid side & a loser bid side).
            // If endInfo bid is frauded in calcBillAndCheckLoserBids L269, revert here. So there needs not check sender==bidder.
            require(
                winnerBids.length.div(2) + loserBids.length.div(2) ==
                    bidCount +
                        (
                            (msg.sender == endBidder &&
                                loseSBTAmount != 0 &&
                                auctionEndPriceWinnerSBTAmount != 0)
                                ? 1
                                : 0
                        ),
                "must submit all of your bids"
            );
        }

        uint64 winnerAmount = calcWinnerAmount(
            auctionID,
            msg.sender,
            winnerBids
        );

        uint64 toPay;
        TimeControlFlag timeFlag = getTimeControlFlag(auctionID);

        if (timeFlag == RECEIVING_SBT_PERIOD_FLAG) {
            toPay = calcBillAndCheckLoserBids(
                auctionID,
                msg.sender,
                winnerAmount,
                myLowestPrice,
                loserBids
            );
        } else {
            require(
                timeFlag > RECEIVING_SBT_PERIOD_FLAG,
                "has not been the receiving period yet"
            );
            toPay = calcBillAndCheckLoserBids(
                auctionID,
                msg.sender,
                winnerAmount,
                SKIP_RECEIVING_WIN_BIDS,
                loserBids
            );
        }

        uint64 IDOLAmountOfChange = auctionLockedIDOLAmountE8
            .sub(toPay)
            .toUint64();
        _auctionBoardContract.deleteParticipantInfo(auctionID, msg.sender);
        _transferIDOL(msg.sender, IDOLAmountOfChange);

        _auctionBoardContract.updateAuctionInfo(
            auctionID,
            0,
            toPay,
            winnerAmount
        );
        _distributeToWinners(auctionID, winnerAmount);

        emit LogAuctionResult(
            auctionID,
            msg.sender,
            winnerAmount,
            toPay,
            IDOLAmountOfChange
        );

        return (winnerAmount, toPay, IDOLAmountOfChange);
    }

    /**
     * @notice Close the auction when it is done. If some part of SBTs remain unsold, the auction is held again.
     */
    function closeAuction(bytes32 auctionID)
        public
        override
        returns (bool, bytes32)
    {
        (uint64 auctionSettledTotalE8, , ) = _auctionBoardContract.auctionInfo(
            auctionID
        );
        require(
            isInPeriod(auctionID, AFTER_AUCTION_FLAG),
            "This function is not allowed to execute in this period"
        );

        uint64 ongoingAuctionSBTTotal = _auctionConfigList[auctionID]
            .ongoingAuctionSBTTotalE8;
        require(ongoingAuctionSBTTotal != 0, "already closed");
        bytes32 bondID = auctionID2BondID[auctionID];

        {
            (, , bool isEndInfoCreated, , ) = _auctionBoardContract
                .auctionDisposalInfo(auctionID);
            require(isEndInfoCreated, "has not set end info");
        }

        _forceToFinalizeWinnerAmount(auctionID);

        uint256 nextAuctionAmount = ongoingAuctionSBTTotal.sub(
            auctionSettledTotalE8,
            "allocated SBT amount for auction never becomes lower than reward total"
        );

        bool isLast = nextAuctionAmount == 0;
        _publishSettledAverageAuctionPrice(auctionID, isLast);

        bytes32 nextAuctionID = bytes32(0);
        if (isLast) {
            // closeAuction adds 10**8 to _bondIDAuctionCount[bondID] and resets beta count
            // when all SBT of the auction is sold out.
            _bondIDAuctionCount[bondID] = _bondIDAuctionCount[bondID]
                .div(POOL_AUCTION_COUNT_PADDING)
                .add(1)
                .mul(POOL_AUCTION_COUNT_PADDING);
        } else {
            // When the SBT is not sold out in the auction, restart a new one until all the SBT is successfully sold.
            nextAuctionID = _startAuction(
                bondID,
                nextAuctionAmount.toUint64(),
                true
            );
        }
        delete _auctionConfigList[auctionID].ongoingAuctionSBTTotalE8;

        emit LogCloseAuction(auctionID, isLast, nextAuctionID);

        return (isLast, nextAuctionID);
    }

    /**
     * @notice This function returns SBT amount and iDOL amount (as its change) settled for those who didn't reveal bids.
     */
    function _calcUnrevealedBidDistribution(
        uint64 ongoingAmount,
        uint64 totalIDOLAmountUnrevealed,
        uint64 totalSBTAmountPaidForUnrevealed,
        uint64 solidStrikePriceIDOL,
        uint64 IDOLAmountDeposited
    )
        internal
        pure
        returns (uint64 receivingSBTAmount, uint64 returnedIDOLAmount)
    {
        // (total target) - (total revealed) = (total unrevealed)
        uint64 totalSBTAmountUnrevealed = totalIDOLAmountUnrevealed
            .mul(10**8)
            .div(solidStrikePriceIDOL, "system error: Oracle has a problem")
            .toUint64();

        // min((total unrevealed), ongoing) - (total paid already) = (total deposit for punishment)
        uint64 totalLeftSBTAmountForUnrevealed = uint256(
            totalSBTAmountUnrevealed
        )
            .min(ongoingAmount)
            .sub(totalSBTAmountPaidForUnrevealed)
            .toUint64();

        // (receiving SBT amount) = min((bid amount), (total deposited))
        uint256 expectedReceivingSBTAmount = IDOLAmountDeposited.mul(10**8).div(
            solidStrikePriceIDOL,
            "system error: Oracle has a problem"
        );

        // (returned iDOL amount) = (deposit amount) - (iDOL value of receiving SBT amount)
        if (expectedReceivingSBTAmount <= totalLeftSBTAmountForUnrevealed) {
            receivingSBTAmount = expectedReceivingSBTAmount.toUint64();
            returnedIDOLAmount = 0;
        } else if (totalLeftSBTAmountForUnrevealed == 0) {
            receivingSBTAmount = 0;
            returnedIDOLAmount = IDOLAmountDeposited;
        } else {
            receivingSBTAmount = totalLeftSBTAmountForUnrevealed;
            returnedIDOLAmount = IDOLAmountDeposited
                .sub(
                totalLeftSBTAmountForUnrevealed
                    .mul(solidStrikePriceIDOL)
                    .divRoundUp(10**8)
            )
                .toUint64();
        }

        return (receivingSBTAmount, returnedIDOLAmount);
    }

    /**
     * @notice Transfer SBT for those who forget to reveal.
     */
    function receiveUnrevealedBidDistribution(bytes32 auctionID, bytes32 secret)
        public
        override
        returns (bool)
    {
        (
            uint64 solidStrikePriceIDOL,
            ,
            bool isEndInfoCreated,
            ,

        ) = _auctionBoardContract.auctionDisposalInfo(auctionID);
        require(
            isEndInfoCreated,
            "EndInfo hasn't been made. This Function has not been allowed yet."
        );

        (address secOwner, , uint64 IDOLAmountDeposited) = _auctionBoardContract
            .auctionSecret(auctionID, secret);
        require(secOwner == msg.sender, "ownership of the bid is required");

        (
            ,
            uint64 totalIDOLSecret,
            uint64 totalIDOLAmountRevealed,

        ) = _auctionBoardContract.auctionRevealInfo(auctionID);
        uint64 totalIDOLAmountUnrevealed = totalIDOLSecret
            .sub(totalIDOLAmountRevealed)
            .toUint64();

        uint64 receivingSBTAmount;
        uint64 returnedIDOLAmount;
        uint64 totalSBTAmountPaidForUnrevealed;
        {
            AuctionConfig memory auctionConfig = _auctionConfigList[auctionID];
            totalSBTAmountPaidForUnrevealed = auctionConfig
                .totalSBTAmountPaidForUnrevealedE8;

            (
                receivingSBTAmount,
                returnedIDOLAmount
            ) = _calcUnrevealedBidDistribution(
                auctionConfig.ongoingAuctionSBTTotalE8,
                totalIDOLAmountUnrevealed,
                totalSBTAmountPaidForUnrevealed,
                solidStrikePriceIDOL,
                IDOLAmountDeposited
            );
        }

        _auctionConfigList[auctionID]
            .totalSBTAmountPaidForUnrevealedE8 = totalSBTAmountPaidForUnrevealed
            .add(receivingSBTAmount)
            .toUint64();
        _auctionBoardContract.removeSecret(auctionID, secret, 0);

        // Transfer the winning SBT and (if necessary) return the rest of deposited iDOL.
        (address solidBondAddress, , , ) = _getBondFromAuctionID(auctionID);
        BondTokenInterface solidBondContract = BondTokenInterface(
            payable(solidBondAddress)
        );
        solidBondContract.transfer(secOwner, receivingSBTAmount);
        _IDOLContract.transfer(secOwner, returnedIDOLAmount);

        return true;
    }

    /**
     * @notice Cancel the bid of your own within the bid acceptance period.
     */
    function cancelBid(bytes32 auctionID, bytes32 secret)
        public
        override
        returns (uint64)
    {
        require(
            isInPeriod(auctionID, ACCEPTING_BIDS_PERIOD_FLAG),
            "it is not the time to accept bids"
        );
        (address owner, , uint64 IDOLamount) = _auctionBoardContract
            .auctionSecret(auctionID, secret);
        require(owner == msg.sender, "you are not the bidder for the secret");
        _auctionBoardContract.removeSecret(auctionID, secret, IDOLamount);
        _transferIDOL(
            owner,
            IDOLamount,
            "system error: try to cancel bid, but cannot return iDOL"
        );

        emit LogCancelBid(auctionID, owner, secret, IDOLamount);

        return IDOLamount;
    }

    /**
     * @notice Returns the current auction ID.
     */
    function getCurrentAuctionID(bytes32 bondID)
        public
        override
        view
        returns (bytes32)
    {
        uint256 count = _bondIDAuctionCount[bondID];
        return generateAuctionID(bondID, count);
    }

    /**
     * @notice Generates auction ID from bond ID and the count of auctions for the bond.
     */
    function generateAuctionID(bytes32 bondID, uint256 count)
        public
        override
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(bondID, count));
    }

    /**
     * @dev The bidder succeeds in winning the SBT for the auctionID with receivingBondAmount, and pays IDOL with billingIDOLAmount.
     */
    function _distributeToWinners(bytes32 auctionID, uint64 receivingBondAmount)
        internal
        returns (uint64)
    {
        // Get the address of SBT contract.
        (address solidBondAddress, , , ) = _getBondFromAuctionID(auctionID);

        // Transfer the winning SBT.
        BondTokenInterface solidBondContract = BondTokenInterface(
            payable(solidBondAddress)
        );
        solidBondContract.transfer(msg.sender, receivingBondAmount);
    }

    /**
     * @dev When isLast is true, the SBTs put up in the auction are sold entirely.
     * The average auction price is used for deciding the amount of IDOL to return from the lock pool.
     */
    function _publishSettledAverageAuctionPrice(bytes32 auctionID, bool isLast)
        internal
    {
        bytes32 bondID = auctionID2BondID[auctionID];
        (
            ,
            uint64 auctionRewardedTotalE8,
            uint64 auctionPaidTotalE8
        ) = _auctionBoardContract.auctionInfo(auctionID);

        // The auction contract actually do not burn iDOL. Paid iDOL will be transferred and burned in the stable coin contract.
        _transferIDOL(
            address(_IDOLContract),
            auctionPaidTotalE8,
            "system error: cannot transfer iDOL from auction contract to iDOL contract"
        );

        _IDOLContract.setSettledAverageAuctionPrice(
            bondID,
            auctionPaidTotalE8,
            auctionRewardedTotalE8,
            isLast
        );
    }

    /**
     * @dev How much IDOL to burn is decided by the settlement price.
     * Hence, this contract needs to decide the price within some specified period.
     */
    function _forceToFinalizeWinnerAmount(bytes32 auctionID) internal {
        (
            uint64 auctionSettledTotalE8,
            uint64 auctionRewardedTotalE8,

        ) = _auctionBoardContract.auctionInfo(auctionID);

        if (_auctionBoardContract.getSortedBidPrice(auctionID).length == 0) {
            return;
        }

        (uint256 burnIDOLRate, , , ) = _auctionBoardContract.getEndInfo(
            auctionID
        );

        uint256 _totalSBTForRestWinners = auctionSettledTotalE8.sub(
            auctionRewardedTotalE8,
            "system error: allocated SBT amount for auction never becomes lower than reward total at any point"
        );

        uint256 burnIDOL = _totalSBTForRestWinners.mul(burnIDOLRate).div(10**8);

        _auctionBoardContract.updateAuctionInfo(
            auctionID,
            _totalSBTForRestWinners.toUint64(),
            burnIDOL.toUint64(),
            _totalSBTForRestWinners.toUint64()
        );
    }

    /**
     * @notice Returns the bond information corresponding to the auction ID.
     */
    function _getBondFromAuctionID(bytes32 auctionID)
        internal
        view
        returns (
            address erc20Address,
            uint256 maturity,
            uint64 stableStrikePrice,
            bytes32 fnMapID
        )
    {
        bytes32 bondID = auctionID2BondID[auctionID];
        return _bondMakerContract.getBond(bondID);
    }

    /**
     * @notice Returns the bond IDs corresponding to the auction IDs respectively.
     */
    function listBondIDFromAuctionID(bytes32[] memory auctionIDs)
        public
        override
        view
        returns (bytes32[] memory bondIDs)
    {
        bondIDs = new bytes32[](auctionIDs.length);
        for (uint256 i = 0; i < auctionIDs.length; i++) {
            bondIDs[i] = auctionID2BondID[auctionIDs[i]];
        }
    }

    /**
     * @notice Returns the auction status.
     * @param auctionID is a auction ID.
     * @return closingTime is .
     * @return auctionAmount is the SBT amount put up in the auction.
     * @return rewardedAmount is .
     * @return totalSBTAmountBid is .
     * @return isEmergency is .
     * @return doneFinalizeWinnerAmount is .
     * @return doneSortPrice is .
     * @return lowestBidPriceDeadLine is the minimum bid price in the auction.
     * @return highestBidPriceDeadLine is the maximum bid price in the auction.
     * @return totalSBTAmountPaidForUnrevealed is the SBT Amount allocated for those who had not revealed their own bid.
     */
    function getAuctionStatus(bytes32 auctionID)
        public
        override
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
        )
    {
        closingTime = auctionClosingTime[auctionID].toUint64();
        AuctionConfig memory auctionConfig = _auctionConfigList[auctionID];
        auctionAmount = auctionConfig.ongoingAuctionSBTTotalE8;
        lowestBidPriceDeadLine = auctionConfig.lowestBidPriceDeadLineE8;
        highestBidPriceDeadLine = auctionConfig.highestBidPriceDeadLineE8;
        totalSBTAmountPaidForUnrevealed = auctionConfig
            .totalSBTAmountPaidForUnrevealedE8;
        (, rewardedAmount, ) = _auctionBoardContract.auctionInfo(auctionID);
        (totalSBTAmountBid, , , ) = _auctionBoardContract.auctionRevealInfo(
            auctionID
        );
        isEmergency = isAuctionEmergency[auctionID];
        (, , , doneFinalizeWinnerAmount, doneSortPrice) = _auctionBoardContract
            .auctionDisposalInfo(auctionID);
    }

    /**
     * @notice Returns the status of auctions which is held in the week.
     * @param weekNumber is the quotient obtained by dividing the timestamp by 7 * 24 * 60 * 60 (= 7 days).
     */
    function getWeeklyAuctionStatus(uint256 weekNumber)
        external
        override
        view
        returns (uint256[] memory weeklyAuctionStatus)
    {
        bytes32[] memory auctions = listAuction(weekNumber);
        weeklyAuctionStatus = new uint256[](auctions.length.mul(6));
        for (uint256 i = 0; i < auctions.length; i++) {
            (
                uint256 closingTime,
                uint64 auctionAmount,
                uint64 rewardedAmount,
                uint64 totalSBTAmountBid,
                bool isEmergency,
                bool doneFinalizeWinnerAmount,
                bool doneSortPrice,
                ,
                ,

            ) = getAuctionStatus(auctions[i]);
            uint8 auctionStatusCode = (isEmergency ? 1 : 0) << 2;
            auctionStatusCode += (doneFinalizeWinnerAmount ? 1 : 0) << 1;
            auctionStatusCode += doneSortPrice ? 1 : 0;
            weeklyAuctionStatus[i * 6] = closingTime;
            weeklyAuctionStatus[i * 6 + 1] = auctionAmount;
            weeklyAuctionStatus[i * 6 + 2] = rewardedAmount;
            weeklyAuctionStatus[i * 6 + 3] = totalSBTAmountBid;
            weeklyAuctionStatus[i * 6 + 4] = auctionStatusCode;
            weeklyAuctionStatus[i * 6 + 5] = uint256(auctions[i]);
        }
    }

    /**
     * @notice Returns total SBT amount put up in the auction.
     */
    function ongoingAuctionSBTTotal(bytes32 auctionID)
        external
        override
        view
        returns (uint64 ongoingSBTAmountE8)
    {
        AuctionConfig memory auctionConfig = _auctionConfigList[auctionID];
        return auctionConfig.ongoingAuctionSBTTotalE8;
    }

    function getAuctionCount(bytes32 bondID)
        external
        override
        view
        returns (uint256 auctionCount)
    {
        return _bondIDAuctionCount[bondID];
    }
}

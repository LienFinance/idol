pragma solidity 0.6.6;

import "../../node_modules/@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../../node_modules/@openzeppelin/contracts/math/SafeMath.sol";
import "../../node_modules/@openzeppelin/contracts/utils/SafeCast.sol";
import "./Interfaces/PriceCalculatorInterface.sol";
import {
    BoxExecutionStatus,
    BoxExecutionStatusLibrary,
    BookExecutionStatus
} from "./Libraries/ExecutionStatus.sol";
import {
    OrderBox,
    OrderBook,
    OrderBoxLibrary,
    OrderBookLibrary
} from "./Libraries/OrderBox.sol";
import {
    OrderType,
    Token,
    OrderTypeLibrary,
    TokenLibrary
} from "./Libraries/Enums.sol";
import "./Libraries/RateMath.sol";


abstract contract BoxExchange is ERC20 {
    using BoxExecutionStatusLibrary for BoxExecutionStatus;
    using OrderBoxLibrary for OrderBox;
    using OrderBookLibrary for OrderBook;
    using OrderTypeLibrary for OrderType;
    using TokenLibrary for Token;
    using RateMath for uint256;
    using SafeMath for uint256;
    using SafeCast for uint256;

    uint256 internal constant MARKET_FEE_RATE = 200000000000000000; // market fee taker takes 20% of spread

    address internal immutable factory;

    address internal immutable marketFeeTaker; // Address that receives market fee (i.e. Lien Token)
    uint128 public marketFeePool0; // Total market fee in TOKEN0
    uint128 public marketFeePool1; // Total market fee in TOKEN1

    uint128 internal reserve0; // Total Liquidity of TOKEN0
    uint128 internal reserve1; // Total Liquidity of TOKEN1
    OrderBox[] internal orderBoxes; // Array of OrderBox
    PriceCalculatorInterface internal immutable priceCalc; // Price Calculator
    BoxExecutionStatus internal boxExecutionStatus; // Struct that has information about execution of current executing OrderBox
    BookExecutionStatus internal bookExecutionStatus; // Struct that has information about execution of current executing OrderBook

    event AcceptOrders(
        address indexed recipient,
        bool indexed isBuy, // if true, this order is exchange from TOKEN0 to TOKEN1
        uint32 indexed boxNumber,
        bool isLimit, // if true, this order is STRICT order
        uint256 tokenIn
    );

    event MoveLiquidity(
        address indexed liquidityProvider,
        bool indexed isAdd, // if true, this order is addtion of liquidity
        uint256 movedToken0Amount,
        uint256 movedToken1Amount,
        uint256 sharesMoved // Amount of share that is minted or burned
    );

    event Execution(
        bool indexed isBuy, // if true, this order is exchange from TOKEN0 to TOKEN1
        uint32 indexed boxNumber,
        address indexed recipient,
        uint256 orderAmount, // Amount of token that is transferred when this order is added
        uint256 refundAmount, // In the same token as orderAmount
        uint256 outAmount // In the other token than orderAmount
    );

    event UpdateReserve(uint128 reserve0, uint128 reserve1, uint256 totalShare);

    event PayMarketFee(uint256 amount0, uint256 amount1);

    event ExecutionSummary(
        uint32 indexed boxNumber,
        uint8 partiallyRefundOrderType,
        uint256 rate,
        uint256 partiallyRefundRate,
        uint256 totalInAmountFLEX_0_1,
        uint256 totalInAmountFLEX_1_0,
        uint256 totalInAmountSTRICT_0_1,
        uint256 totalInAmountSTRICT_1_0
    );

    modifier isAmountSafe(uint256 amount) {
        require(amount != 0, "Amount should be bigger than 0");
        _;
    }

    modifier isInTime(uint256 timeout) {
        require(timeout > _currentOpenBoxId(), "Time out");
        _;
    }

    constructor(
        PriceCalculatorInterface _priceCalc,
        address _marketFeeTaker,
        string memory _name
    ) public ERC20(_name, "share") {
        factory = msg.sender;
        priceCalc = _priceCalc;
        marketFeeTaker = _marketFeeTaker;
        _setupDecimals(8); // Decimal of share token is the same as iDOL, LBT, and Lien Token
    }

    /**
     * @notice Shows how many boxes and orders exist before the specific order
     * @dev If this order does not exist, return (false, 0, 0)
     * @dev If this order is already executed, return (true, 0, 0)
     * @param recipient Recipient of this order
     * @param boxNumber Box ID where the order exists
     * @param isExecuted If true, the order is already executed
     * @param boxCount Counter of boxes before this order. If current executing box number is the same as boxNumber, return 1 (i.e. indexing starts from 1)
     * @param orderCount Counter of orders before this order. If this order is on n-th top of the queue, return n (i.e. indexing starts from 1)
     **/
    function whenToExecute(
        address recipient,
        uint256 boxNumber,
        bool isBuy,
        bool isLimit
    )
        external
        view
        returns (
            bool isExecuted,
            uint256 boxCount,
            uint256 orderCount
        )
    {
        return
            _whenToExecute(recipient, _getOrderType(isBuy, isLimit), boxNumber);
    }

    /**
     * @notice Returns summary of current exchange status
     * @param boxNumber Current open box ID
     * @param _reserve0 Current reserve of TOKEN0
     * @param _reserve1 Current reserve of TOKEN1
     * @param totalShare Total Supply of share token
     * @param latestSpreadRate Spread Rate in latest OrderBox
     * @param token0PerShareE18 Amount of TOKEN0 per 1 share token and has 18 decimal
     * @param token1PerShareE18 Amount of TOKEN1 per 1 share token and has 18 decimal
     **/
    function getExchangeData()
        external
        virtual
        view
        returns (
            uint256 boxNumber,
            uint256 _reserve0,
            uint256 _reserve1,
            uint256 totalShare,
            uint256 latestSpreadRate,
            uint256 token0PerShareE18,
            uint256 token1PerShareE18
        )
    {
        boxNumber = _currentOpenBoxId();
        (_reserve0, _reserve1) = _getReserves();
        latestSpreadRate = orderBoxes[boxNumber].spreadRate;
        totalShare = totalSupply();
        token0PerShareE18 = RateMath.getRate(_reserve0, totalShare);
        token1PerShareE18 = RateMath.getRate(_reserve1, totalShare);
    }

    /**
     * @notice Gets summary of Current box information (Total order amount of each OrderTypes)
     * @param executionStatusNumber Status of execution of this box
     * @param boxNumber ID of target box.
     **/
    function getBoxSummary(uint256 boxNumber)
        public
        view
        returns (
            uint256 executionStatusNumber,
            uint256 flexToken0InAmount,
            uint256 strictToken0InAmount,
            uint256 flexToken1InAmount,
            uint256 strictToken1InAmount
        )
    {
        // `executionStatusNumber`
        // 0 => This box has not been executed
        // 1 => This box is currently executing. (Reserves and market fee pools have already been updated)
        // 2 => This box has already been executed
        uint256 nextExecutingBoxId = boxExecutionStatus.boxNumber;
        flexToken0InAmount = orderBoxes[boxNumber].orderBooks[OrderType
            .FLEX_0_1]
            .totalInAmount;
        strictToken0InAmount = orderBoxes[boxNumber].orderBooks[OrderType
            .STRICT_0_1]
            .totalInAmount;
        flexToken1InAmount = orderBoxes[boxNumber].orderBooks[OrderType
            .FLEX_1_0]
            .totalInAmount;
        strictToken1InAmount = orderBoxes[boxNumber].orderBooks[OrderType
            .STRICT_1_0]
            .totalInAmount;
        if (boxNumber < nextExecutingBoxId) {
            executionStatusNumber = 2;
        } else if (
            boxNumber == nextExecutingBoxId && boxExecutionStatus.onGoing
        ) {
            executionStatusNumber = 1;
        }
    }

    /**
     * @notice Gets amount of order in current open box
     * @param account Target Address
     * @param orderType OrderType of target order
     * @return Amount of target order
     **/
    function getOrderAmount(address account, OrderType orderType)
        public
        view
        returns (uint256)
    {
        return
            orderBoxes[_currentOpenBoxId()].orderBooks[orderType]
                .inAmounts[account];
    }

    // abstract functions
    function _feeRate() internal virtual returns (uint128);

    function _receiveTokens(
        Token token,
        address from,
        uint256 amount
    ) internal virtual;

    function _sendTokens(
        Token token,
        address to,
        uint256 amount
    ) internal virtual;

    function _payForOrderExecution(
        Token token,
        address to,
        uint256 amount
    ) internal virtual;

    function _payMarketFee(
        address _marketFeeTaker,
        uint256 amount0,
        uint256 amount1
    ) internal virtual;

    function _isCurrentOpenBoxExpired() internal virtual view returns (bool) {}

    /**
     * @notice User can determine the amount of share token to mint.
     * @dev This function can be executed only by factory
     * @param amount0 The amount of TOKEN0 to invest
     * @param amount1 The amount of TOKEN1 to invest
     * @param initialShare The amount of share token to mint. This defines approximate value of share token.
     **/
    function _init(
        uint128 amount0,
        uint128 amount1,
        uint256 initialShare
    ) internal virtual {
        require(totalSupply() == 0, "Already initialized");
        require(msg.sender == factory);
        _updateReserve(amount0, amount1);
        _mint(msg.sender, initialShare);
        _receiveTokens(Token.TOKEN0, msg.sender, amount0);
        _receiveTokens(Token.TOKEN1, msg.sender, amount1);
        _openNewBox();
    }

    /**
     * @dev Amount of share to mint is determined by `amount`
     * @param tokenType Type of token which the amount of share the LP get is calculated based on `amount`
     * @param amount The amount of token type of `tokenType`
     **/
    function _addLiquidity(
        uint256 _reserve0,
        uint256 _reserve1,
        uint256 amount,
        uint256 minShare,
        Token tokenType
    ) internal virtual {
        (uint256 amount0, uint256 amount1, uint256 share) = _calculateAmounts(
            amount,
            _reserve0,
            _reserve1,
            tokenType
        );
        require(share >= minShare, "You can't receive enough shares");
        _receiveTokens(Token.TOKEN0, msg.sender, amount0);
        _receiveTokens(Token.TOKEN1, msg.sender, amount1);
        _updateReserve(
            _reserve0.add(amount0).toUint128(),
            _reserve1.add(amount1).toUint128()
        );
        _mint(msg.sender, share);
        emit MoveLiquidity(msg.sender, true, amount0, amount1, share);
    }

    /**
     * @dev Amount of TOKEN0 and TOKEN1 is determined by amount of share to be burned
     * @param minAmount0 Minimum amount of TOKEN0 to return. If returned TOKEN0 is less than this value, revert transaction
     * @param minAmount1 Minimum amount of TOKEN1 to return. If returned TOKEN1 is less than this value, revert transaction
     * @param share Amount of share token to be burned
     **/
    function _removeLiquidity(
        uint256 minAmount0,
        uint256 minAmount1,
        uint256 share
    ) internal virtual {
        (uint256 _reserve0, uint256 _reserve1) = _getReserves(); // gas savings
        uint256 _totalSupply = totalSupply();
        uint256 amount0 = _reserve0.mul(share).div(_totalSupply);
        uint256 amount1 = _reserve1.mul(share).div(_totalSupply);
        require(
            amount0 >= minAmount0 && amount1 >= minAmount1,
            "You can't receive enough tokens"
        );
        _updateReserve(
            _reserve0.sub(amount0).toUint128(),
            _reserve1.sub(amount1).toUint128()
        );
        _burn(msg.sender, share);
        _sendTokens(Token.TOKEN0, msg.sender, amount0);
        _sendTokens(Token.TOKEN1, msg.sender, amount1);
        emit MoveLiquidity(msg.sender, false, amount0, amount1, share);
    }

    /**
     * @dev If there is some OrderBox to be executed, try execute 5 orders
     * @dev If currentBox has expired, open new box
     * @param orderType Type of order
     * @param inAmount Amount of token to be exchanged
     * @param recipient Recipient of swapped token. If this value is address(0), msg.sender is the recipient
     **/
    function _addOrder(
        OrderType orderType,
        uint256 inAmount,
        address recipient
    ) internal virtual {
        _rotateBox();
        uint256 _currentOpenBoxId = _currentOpenBoxId();
        _executeOrders(5, _currentOpenBoxId);
        if (recipient == address(0)) {
            recipient = msg.sender;
        }
        _receiveTokens(orderType.inToken(), msg.sender, inAmount);
        orderBoxes[_currentOpenBoxId].addOrder(orderType, inAmount, recipient);
        emit AcceptOrders(
            recipient,
            orderType.isBuy(),
            uint32(_currentOpenBoxId),
            orderType.isStrict(),
            inAmount
        );
    }

    /**
     * @dev Triggers executeOrders()
     * @param maxOrderNum Number of orders to execute (if no order is left, stop execution)
     **/
    function _triggerExecuteOrders(uint8 maxOrderNum) internal virtual {
        _executeOrders(maxOrderNum, _currentOpenBoxId());
    }

    /**
     * @dev Triggers PayMarketFee() and update marketFeePool to 0
     **/
    function _triggerPayMarketFee() internal virtual {
        (
            uint256 _marketFeePool0,
            uint256 _marketFeePool1
        ) = _getMarketFeePools();
        _updateMarketFeePool(0, 0);

        emit PayMarketFee(_marketFeePool0, _marketFeePool1);
        _payMarketFee(marketFeeTaker, _marketFeePool0, _marketFeePool1);
    }

    // When open new box, creates new OrderBox with spreadRate and block number of expiretion, then pushes it to orderBoxes
    function _openNewBox() internal virtual {
        orderBoxes.push(
            OrderBoxLibrary.newOrderBox(
                _feeRate(),
                (block.number + 2).toUint32()
            )
        );
    }

    function _rotateBox() private {
        // if current open box has expired
        if (_isCurrentOpenBoxExpired()) {
            _openNewBox();
        }
    }

    /**
     * @param maxOrderNum Number of orders to execute (if no order is left, stoppes execution)
     * @param _currentOpenBoxId Current box ID (_currentOpenBoxID() is already run in _addOrder() or _triggerExecuteOrders()
     **/
    function _executeOrders(uint256 maxOrderNum, uint256 _currentOpenBoxId)
        private
    {
        BoxExecutionStatus memory _boxExecutionStatus = boxExecutionStatus;
        BookExecutionStatus memory _bookExecutionStatus = bookExecutionStatus;
        // if _boxExecutionStatus.boxNumber is current open and not expired box, won't execute.
        // if _boxExecutionStatus.boxNumber is more than currentOpenBoxId, the newest box is already executed.
        if (
            _boxExecutionStatus.boxNumber >= _currentOpenBoxId &&
            (!_isCurrentOpenBoxExpired() ||
                _boxExecutionStatus.boxNumber > _currentOpenBoxId)
        ) {
            return;
        }
        if (!_boxExecutionStatus.onGoing) {
            // get rates and start new box execution
            // before start new box execution, updates reserves.
            {
                (
                    OrderType partiallyRefundOrderType,
                    uint256 partiallyRefundRate,
                    uint256 rate
                ) = _getExecutionRatesAndUpdateReserve(
                    _boxExecutionStatus.boxNumber
                );
                _boxExecutionStatus
                    .partiallyRefundOrderType = partiallyRefundOrderType;
                _boxExecutionStatus.partiallyRefundRate = partiallyRefundRate
                    .toUint64();
                _boxExecutionStatus.rate = rate.toUint128();
                _boxExecutionStatus.onGoing = true;
                _bookExecutionStatus.executingOrderType = OrderType(0);
                _bookExecutionStatus.nextIndex = 0;
            }
        }
        // execute orders in one book
        // reducing maxOrderNum to avoid stack to deep
        while (maxOrderNum != 0) {
            OrderBook storage executionBook = orderBoxes[_boxExecutionStatus
                .boxNumber]
                .orderBooks[_bookExecutionStatus.executingOrderType];
            (
                bool isBookFinished,
                uint256 nextIndex,
                uint256 executedOrderNum
            ) = _executeOrdersInBook(
                executionBook,
                _bookExecutionStatus.executingOrderType.inToken(),
                _bookExecutionStatus.nextIndex,
                _boxExecutionStatus.refundRate(
                    _bookExecutionStatus.executingOrderType
                ),
                _boxExecutionStatus.rate,
                orderBoxes[_boxExecutionStatus.boxNumber].spreadRate,
                maxOrderNum
            );
            if (isBookFinished) {
                bool isBoxFinished = _isBoxFinished(
                    orderBoxes[_boxExecutionStatus.boxNumber],
                    _bookExecutionStatus.executingOrderType
                );
                delete orderBoxes[_boxExecutionStatus.boxNumber]
                    .orderBooks[_bookExecutionStatus.executingOrderType];

                // update book execution status and box execution status
                if (isBoxFinished) {
                    _boxExecutionStatus.boxNumber += 1;
                    _boxExecutionStatus.onGoing = false;
                    boxExecutionStatus = _boxExecutionStatus;

                    return; // no need to update bookExecutionStatus;
                }
                _bookExecutionStatus.executingOrderType = _bookExecutionStatus
                    .executingOrderType
                    .next();
            }
            _bookExecutionStatus.nextIndex = nextIndex.toUint32();
            maxOrderNum -= executedOrderNum;
        }
        boxExecutionStatus = _boxExecutionStatus;
        bookExecutionStatus = _bookExecutionStatus;
    }

    /**
     * @notice Executes each OrderBook
     * @param orderBook Target OrderBook
     * @param rate Rate of swap
     * @param refundRate Refund rate in this OrderType
     * @param maxOrderNum Max number of orders to execute in this book
     * @return If execution is finished, return true
     * @return Next index to execute. If execution is finished, return 0
     * @return Number of orders executed
     **/
    function _executeOrdersInBook(
        OrderBook storage orderBook,
        Token inToken,
        uint256 initialIndex,
        uint256 refundRate,
        uint256 rate,
        uint256 spreadRate,
        uint256 maxOrderNum
    )
        private
        returns (
            bool,
            uint256,
            uint256
        )
    {
        uint256 index;
        uint256 numOfOrder = orderBook.numOfOrder();
        for (
            index = initialIndex;
            index - initialIndex < maxOrderNum;
            index++
        ) {
            if (index >= numOfOrder) {
                return (true, 0, index - initialIndex);
            }
            address recipient = orderBook.recipients[index];
            _executeOrder(
                inToken,
                recipient,
                orderBook.inAmounts[recipient],
                refundRate,
                rate,
                spreadRate
            );
        }
        if (index >= numOfOrder) {
            return (true, 0, index - initialIndex);
        }
        return (false, index, index - initialIndex);
    }

    /**
     * @dev Executes each order
     * @param inToken type of token
     * @param recipient Recipient of Token
     * @param inAmount Amount of token
     * @param refundRate Refund rate in this OrderType
     * @param rate Rate of swap
     * @param spreadRate Spread rate in this box
     **/
    function _executeOrder(
        Token inToken,
        address recipient,
        uint256 inAmount,
        uint256 refundRate,
        uint256 rate,
        uint256 spreadRate
    ) internal {
        Token outToken = inToken.another();
        // refundAmount = inAmount * refundRate
        uint256 refundAmount = inAmount.mulByRate(refundRate);
        // executingInAmountWithoutSpread = (inAmount - refundAmount) / (1+spreadRate)
        uint256 executingInAmountWithoutSpread = inAmount
            .sub(refundAmount)
            .divByRate(RateMath.RATE_POINT_MULTIPLIER.add(spreadRate));
        // spread = executingInAmountWithoutSpread * spreadRate
        // = (inAmount - refundAmount ) * ( 1 - 1 /( 1 + spreadRate))
        uint256 outAmount = _otherAmountBasedOnRate(
            inToken,
            executingInAmountWithoutSpread,
            rate
        );
        _payForOrderExecution(inToken, recipient, refundAmount);
        _payForOrderExecution(outToken, recipient, outAmount);
        emit Execution(
            (inToken == Token.TOKEN0),
            uint32(_currentOpenBoxId()),
            recipient,
            inAmount,
            refundAmount,
            outAmount
        );
    }

    /**
     * @notice Updates reserves and market fee pools
     * @param spreadRate Spread rate in the box
     * @param executingAmount0WithoutSpread Executed amount of TOKEN0 in this box
     * @param executingAmount1WithoutSpread Executed amount of TOKEN1 in this box
     * @param rate Rate of swap
     **/
    function _updateReservesAndMarketFeePoolByExecution(
        uint256 spreadRate,
        uint256 executingAmount0WithoutSpread,
        uint256 executingAmount1WithoutSpread,
        uint256 rate
    ) internal virtual {
        uint256 newReserve0;
        uint256 newReserve1;
        uint256 newMarketFeePool0;
        uint256 newMarketFeePool1;
        {
            (
                uint256 differenceOfReserve,
                uint256 differenceOfMarketFee
            ) = _calculateNewReserveAndMarketFeePool(
                spreadRate,
                executingAmount0WithoutSpread,
                executingAmount1WithoutSpread,
                rate,
                Token.TOKEN0
            );
            newReserve0 = reserve0 + differenceOfReserve;
            newMarketFeePool0 = marketFeePool0 + differenceOfMarketFee;
        }
        {
            (
                uint256 differenceOfReserve,
                uint256 differenceOfMarketFee
            ) = _calculateNewReserveAndMarketFeePool(
                spreadRate,
                executingAmount1WithoutSpread,
                executingAmount0WithoutSpread,
                rate,
                Token.TOKEN1
            );
            newReserve1 = reserve1 + differenceOfReserve;
            newMarketFeePool1 = marketFeePool1 + differenceOfMarketFee;
        }
        _updateReserve(newReserve0.toUint128(), newReserve1.toUint128());
        _updateMarketFeePool(
            newMarketFeePool0.toUint128(),
            newMarketFeePool1.toUint128()
        );
    }

    function _whenToExecute(
        address recipient,
        uint256 orderTypeCount,
        uint256 boxNumber
    )
        internal
        view
        returns (
            bool isExecuted,
            uint256 boxCount,
            uint256 orderCount
        )
    {
        if (boxNumber > _currentOpenBoxId()) {
            return (false, 0, 0);
        }
        OrderBox storage yourOrderBox = orderBoxes[boxNumber];
        address[] memory recipients = yourOrderBox.orderBooks[OrderType(
            orderTypeCount
        )]
            .recipients;
        uint256 nextExecutingBoxId = boxExecutionStatus.boxNumber;
        uint256 nextIndex = bookExecutionStatus.nextIndex;
        uint256 nextType = uint256(bookExecutionStatus.executingOrderType);
        bool onGoing = boxExecutionStatus.onGoing;
        bool isExist;
        uint256 place;
        for (uint256 j = 0; j != recipients.length; j++) {
            if (recipients[j] == recipient) {
                isExist = true;
                place = j;
                break;
            }
        }

        // If current box number exceeds boxNumber, the target box has already been executed
        // If current box number is equal to boxNumber, and OrderType or index exceeds that of the target order, the target box has already been executed
        if (
            (boxNumber < nextExecutingBoxId) ||
            ((onGoing && (boxNumber == nextExecutingBoxId)) &&
                ((orderTypeCount < nextType) ||
                    ((orderTypeCount == nextType) && (place < nextIndex))))
        ) {
            return (true, 0, 0);
        }

        if (!isExist) {
            return (false, 0, 0);
        }

        // Total number of orders before the target OrderType
        uint256 counts;
        if (boxNumber == nextExecutingBoxId && onGoing) {
            for (uint256 i = nextType; i < orderTypeCount; i++) {
                counts += yourOrderBox.orderBooks[OrderType(i)].numOfOrder();
            }
            boxCount = 1;
            orderCount = counts.add(place).sub(nextIndex) + 1;
        } else {
            for (uint256 i = 0; i != orderTypeCount; i++) {
                counts += yourOrderBox.orderBooks[OrderType(i)].numOfOrder();
            }
            boxCount = boxNumber.sub(nextExecutingBoxId) + 1;
            orderCount = counts.add(place) + 1;
        }
    }

    function _getReserves()
        internal
        view
        returns (uint256 _reserve0, uint256 _reserve1)
    {
        _reserve0 = reserve0;
        _reserve1 = reserve1;
    }

    function _getMarketFeePools()
        internal
        view
        returns (uint256 _marketFeePool0, uint256 _marketFeePool1)
    {
        _marketFeePool0 = marketFeePool0;
        _marketFeePool1 = marketFeePool1;
    }

    function _updateReserve(uint128 newReserve0, uint128 newReserve1) internal {
        reserve0 = newReserve0;
        reserve1 = newReserve1;
        emit UpdateReserve(newReserve0, newReserve1, totalSupply());
    }

    function _calculatePriceWrapper(
        uint256 flexToken0InWithoutSpread,
        uint256 strictToken0InWithoutSpread,
        uint256 flexToken1InWithoutSpread,
        uint256 strictToken1InWithoutSpread,
        uint256 _reserve0,
        uint256 _reserve1
    )
        internal
        view
        returns (
            uint256 rate,
            uint256 refundStatus,
            uint256 partiallyRefundRate,
            uint256 executingAmount0,
            uint256 executingAmount1
        )
    {
        uint256[5] memory data = priceCalc.calculatePrice(
            flexToken0InWithoutSpread,
            strictToken0InWithoutSpread,
            flexToken1InWithoutSpread,
            strictToken1InWithoutSpread,
            _reserve0,
            _reserve1
        );
        return (data[0], data[1], data[2], data[3], data[4]);
    }

    /**
     * @param rate0Per1 Token0 / Token1 * RATE_POINT_MULTIPLIER
     */
    function _otherAmountBasedOnRate(
        Token token,
        uint256 amount,
        uint256 rate0Per1
    ) internal pure returns (uint256) {
        if (token == Token.TOKEN0) {
            return amount.mulByRate(rate0Per1);
        } else {
            return amount.divByRate(rate0Per1);
        }
    }

    function _currentOpenBoxId() internal view returns (uint256) {
        return orderBoxes.length - 1;
    }

    /**
     * @notice Gets OrderType in uint
     **/
    function _getOrderType(bool isBuy, bool isLimit)
        internal
        pure
        returns (uint256 orderTypeCount)
    {
        if (isBuy && isLimit) {
            orderTypeCount = 2;
        } else if (!isBuy) {
            if (isLimit) {
                orderTypeCount = 3;
            } else {
                orderTypeCount = 1;
            }
        }
    }

    function _updateMarketFeePool(
        uint128 newMarketFeePool0,
        uint128 newMarketFeePool1
    ) private {
        marketFeePool0 = newMarketFeePool0;
        marketFeePool1 = newMarketFeePool1;
    }

    function _calculateAmounts(
        uint256 amount,
        uint256 _reserve0,
        uint256 _reserve1,
        Token tokenType
    )
        private
        view
        returns (
            uint256,
            uint256,
            uint256
        )
    {
        if (tokenType == Token.TOKEN0) {
            return (
                amount,
                amount.mul(_reserve1).div(_reserve0),
                amount.mul(totalSupply()).div(_reserve0)
            );
        } else {
            return (
                amount.mul(_reserve0).div(_reserve1),
                amount,
                amount.mul(totalSupply()).div(_reserve1)
            );
        }
    }

    function _priceCalculateRates(
        OrderBox storage orderBox,
        uint256 totalInAmountFLEX_0_1,
        uint256 totalInAmountFLEX_1_0,
        uint256 totalInAmountSTRICT_0_1,
        uint256 totalInAmountSTRICT_1_0
    )
        private
        view
        returns (
            uint256 rate,
            uint256 refundStatus,
            uint256 partiallyRefundRate,
            uint256 executingAmount0,
            uint256 executingAmount1
        )
    {
        uint256 withoutSpreadRate = RateMath.RATE_POINT_MULTIPLIER +
            orderBox.spreadRate;
        return
            _calculatePriceWrapper(
                totalInAmountFLEX_0_1.divByRate(withoutSpreadRate),
                totalInAmountSTRICT_0_1.divByRate(withoutSpreadRate),
                totalInAmountFLEX_1_0.divByRate(withoutSpreadRate),
                totalInAmountSTRICT_1_0.divByRate(withoutSpreadRate),
                reserve0,
                reserve1
            );
    }

    function _getExecutionRatesAndUpdateReserve(uint32 boxNumber)
        private
        returns (
            OrderType partiallyRefundOrderType,
            uint256 partiallyRefundRate,
            uint256 rate
        )
    {
        OrderBox storage orderBox = orderBoxes[boxNumber];
        // `refundStatus`
        // 0 => no_refund
        // 1 => refund some of strictToken0
        // 2 => refund all strictToken0 and some of flexToken0
        // 3 => refund some of strictToken1
        // 4 => refund all strictToken1 and some of flexToken1
        uint256 refundStatus;
        uint256 executingAmount0WithoutSpread;
        uint256 executingAmount1WithoutSpread;
        uint256 totalInAmountFLEX_0_1 = orderBox.orderBooks[OrderType.FLEX_0_1]
            .totalInAmount;
        uint256 totalInAmountFLEX_1_0 = orderBox.orderBooks[OrderType.FLEX_1_0]
            .totalInAmount;
        uint256 totalInAmountSTRICT_0_1 = orderBox.orderBooks[OrderType
            .STRICT_0_1]
            .totalInAmount;
        uint256 totalInAmountSTRICT_1_0 = orderBox.orderBooks[OrderType
            .STRICT_1_0]
            .totalInAmount;
        (
            rate,
            refundStatus,
            partiallyRefundRate,
            executingAmount0WithoutSpread,
            executingAmount1WithoutSpread
        ) = _priceCalculateRates(
            orderBox,
            totalInAmountFLEX_0_1,
            totalInAmountFLEX_1_0,
            totalInAmountSTRICT_0_1,
            totalInAmountSTRICT_1_0
        );

        {
            if (refundStatus == 0) {
                partiallyRefundOrderType = OrderType.STRICT_0_1;
                //refundRate = 0;
            } else if (refundStatus == 1) {
                partiallyRefundOrderType = OrderType.STRICT_0_1;
            } else if (refundStatus == 2) {
                partiallyRefundOrderType = OrderType.FLEX_0_1;
            } else if (refundStatus == 3) {
                partiallyRefundOrderType = OrderType.STRICT_1_0;
            } else if (refundStatus == 4) {
                partiallyRefundOrderType = OrderType.FLEX_1_0;
            }
        }
        emit ExecutionSummary(
            boxNumber,
            uint8(partiallyRefundOrderType),
            rate,
            partiallyRefundRate,
            totalInAmountFLEX_0_1,
            totalInAmountFLEX_1_0,
            totalInAmountSTRICT_0_1,
            totalInAmountSTRICT_1_0
        );
        _updateReservesAndMarketFeePoolByExecution(
            orderBox.spreadRate,
            executingAmount0WithoutSpread,
            executingAmount1WithoutSpread,
            rate
        );
    }

    /**
     * @notice Detects if this OrderBox is finished
     * @param orders Target OrderBox
     * @param lastFinishedOrderType Latest OrderType which is executed
     **/
    function _isBoxFinished(
        OrderBox storage orders,
        OrderType lastFinishedOrderType
    ) private view returns (bool) {
        // If orderType is STRICT_1_0, no book is left
        if (lastFinishedOrderType == OrderType.STRICT_1_0) {
            return true;
        }
        for (uint256 i = uint256(lastFinishedOrderType.next()); i != 4; i++) {
            OrderBook memory book = orders.orderBooks[OrderType(i)];
            // If OrderBook has some order return false
            if (book.numOfOrder() != 0) {
                return false;
            }
        }
        return true;
    }

    function _calculateNewReserveAndMarketFeePool(
        uint256 spreadRate,
        uint256 executingAmountWithoutSpread,
        uint256 anotherExecutingAmountWithoutSpread,
        uint256 rate,
        Token tokenType
    ) internal returns (uint256, uint256) {
        uint256 totalSpread = executingAmountWithoutSpread.mulByRate(
            spreadRate
        );
        uint256 marketFee = totalSpread.mulByRate(MARKET_FEE_RATE);
        uint256 newReserve = executingAmountWithoutSpread +
            (totalSpread - marketFee) -
            _otherAmountBasedOnRate(
                tokenType.another(),
                anotherExecutingAmountWithoutSpread,
                rate
            );
        return (newReserve, marketFee);
    }

    function _getTokenType(bool isBuy, bool isStrict)
        internal
        pure
        returns (OrderType)
    {
        if (isBuy) {
            if (isStrict) {
                return OrderType.STRICT_0_1;
            } else {
                return OrderType.FLEX_0_1;
            }
        } else {
            if (isStrict) {
                return OrderType.STRICT_1_0;
            } else {
                return OrderType.FLEX_1_0;
            }
        }
    }
}

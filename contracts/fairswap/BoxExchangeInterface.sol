pragma solidity 0.6.6;

import {
    OrderType,
    Token,
    OrderTypeLibrary,
    TokenLibrary
} from "./Libraries/Enums.sol";


interface BoxExchangeInterface {
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

    function marketFeePool0() external view returns (uint128);

    function marketFeePool1() external view returns (uint128);

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
        );

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
        view
        returns (
            uint256 boxNumber,
            uint256 _reserve0,
            uint256 _reserve1,
            uint256 totalShare,
            uint256 latestSpreadRate,
            uint256 token0PerShareE18,
            uint256 token1PerShareE18
        );

    /**
     * @notice Gets summary of Current box information (Total order amount of each OrderTypes)
     * @param executionStatusNumber Status of execution of this box
     * @param boxNumber ID of target box.
     **/
    function getBoxSummary(uint256 boxNumber)
        external
        view
        returns (
            uint256 executionStatusNumber,
            uint256 flexToken0InAmount,
            uint256 strictToken0InAmount,
            uint256 flexToken1InAmount,
            uint256 strictToken1InAmount
        );

    /**
     * @notice Gets amount of order in current open box
     * @param account Target Address
     * @param orderType OrderType of target order
     * @return Amount of target order
     **/
    function getOrderAmount(address account, OrderType orderType)
        external
        view
        returns (uint256);

    /**
     * @param IDOLAmount Amount of initial liquidity of iDOL to be provided
     * @param settlementTokenAmount Amount of initial liquidity of the other token to be provided
     * @param initialShare Initial amount of share token
     **/
    function initializeExchange(
        uint256 IDOLAmount,
        uint256 settlementTokenAmount,
        uint256 initialShare
    ) external;

    /**
     * @param timeout Revert if nextBoxNumber exceeds `timeout`
     * @param recipient Recipient of swapped token. If `recipient` == address(0), recipient is msg.sender
     * @param IDOLAmount Amount of token that should be approved before executing this function
     * @param isLimit Whether the order restricts a large slippage
     * @dev if isLimit is true and reserve0/reserve1 * 1.001 >  `rate`, the order will be executed, otherwise token will be refunded
     * @dev if isLimit is false and reserve0/reserve1 * 1.05 > `rate`, the order will be executed, otherwise token will be refunded
     **/
    function orderBaseToSettlement(
        uint256 timeout,
        address recipient,
        uint256 IDOLAmount,
        bool isLimit
    ) external;

    /**
     * @param timeout Revert if nextBoxNumber exceeds `timeout`
     * @param recipient Recipient of swapped token. If `recipient` == address(0), recipient is msg.sender
     * @param settlementTokenAmount Amount of token that should be approved before executing this function
     * @param isLimit Whether the order restricts a large slippage
     * @dev if isLimit is true and reserve0/reserve1 * 0.999 > `rate`, the order will be executed, otherwise token will be refunded
     * @dev if isLimit is false and reserve0/reserve1 * 0.95 > `rate`, the order will be executed, otherwise token will be refunded
     **/
    function orderSettlementToBase(
        uint256 timeout,
        address recipient,
        uint256 settlementTokenAmount,
        bool isLimit
    ) external;

    /**
     * @notice LP provides liquidity and receives share token
     * @param timeout Revert if nextBoxNumber exceeds `timeout`
     * @param IDOLAmount Amount of iDOL to be provided. The amount of the other token required is calculated based on this amount
     * @param minShares Minimum amount of share token LP will receive. If amount of share token is less than `minShares`, revert the transaction
     **/
    function addLiquidity(
        uint256 timeout,
        uint256 IDOLAmount,
        uint256 settlementTokenAmount,
        uint256 minShares
    ) external;

    /**
     * @notice LP burns share token and receives iDOL and the other token
     * @param timeout Revert if nextBoxNumber exceeds `timeout`
     * @param minBaseTokens Minimum amount of iDOL LP will receive. If amount of iDOL is less than `minBaseTokens`, revert the transaction
     * @param minSettlementTokens Minimum amount of the other token LP will get. If amount is less than `minSettlementTokens`, revert the transaction
     * @param sharesBurned Amount of share token to be burned
     **/
    function removeLiquidity(
        uint256 timeout,
        uint256 minBaseTokens,
        uint256 minSettlementTokens,
        uint256 sharesBurned
    ) external;

    /**
     * @notice Executes orders that are unexecuted
     * @param maxOrderNum Max number of orders to be executed
     **/
    function executeUnexecutedBox(uint8 maxOrderNum) external;

    function sendMarketFeeToLien() external;
}

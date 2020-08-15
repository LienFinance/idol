pragma solidity 0.6.6;

import "./BoxExchange.sol";
import "./ERC20Interface.sol";
import "../../node_modules/@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "./SpreadCalculatorInterface.sol";
import "../oracle/OracleInterface.sol";


abstract contract TokenBoxExchange is BoxExchange {
    using SafeERC20 for ERC20Interface;

    ERC20Interface public immutable idol; // token0
    ERC20Interface public immutable token;
    SpreadCalculatorInterface internal immutable spreadCalc;
    OracleInterface internal immutable oracle;

    event SpreadRate(uint128 indexed boxNumber, uint128 spreadRate);

    /**
     * @param _idol iDOL contract
     * @param _token ERC20 contract
     * @param _priceCalc Price Calculator contract
     * @param _marketFeeTaker Address of market fee taker (i.e. Lien Token)
     * @param _spreadCalc Spread Calculator contract
     * @param _oracle Oracle contract
     * @param _name Name of share token
     **/
    constructor(
        ERC20Interface _idol,
        ERC20Interface _token,
        PriceCalculatorInterface _priceCalc,
        address _marketFeeTaker,
        SpreadCalculatorInterface _spreadCalc,
        OracleInterface _oracle,
        string memory _name
    ) public BoxExchange(_priceCalc, _marketFeeTaker, _name) {
        idol = _idol;
        token = _token;
        spreadCalc = _spreadCalc;
        oracle = _oracle;
    }

    /**
     * @param IDOLAmount Amount of initial liquidity of iDOL to be provided
     * @param settlementTokenAmount Amount of initial liquidity of the other token to be provided
     * @param initialShare Initial amount of share token
     **/
    function initializeExchange(
        uint256 IDOLAmount,
        uint256 settlementTokenAmount,
        uint256 initialShare
    ) external {
        _init(
            uint128(IDOLAmount),
            uint128(settlementTokenAmount),
            initialShare
        );
    }

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
    ) external isAmountSafe(IDOLAmount) isInTime(timeout) {
        OrderType orderType = _getTokenType(true, isLimit);
        _addOrder(orderType, IDOLAmount, recipient);
    }

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
    ) external isAmountSafe(settlementTokenAmount) isInTime(timeout) {
        OrderType orderType = _getTokenType(false, isLimit);
        _addOrder(orderType, settlementTokenAmount, recipient);
    }

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
    )
        external
        isAmountSafe(IDOLAmount)
        isAmountSafe(settlementTokenAmount)
        isInTime(timeout)
    {
        require(timeout > _currentOpenBoxId(), "Time out");
        (uint256 _reserve0, uint256 _reserve1) = _getReserves(); // gas savings
        uint256 settlementAmountInBase = settlementTokenAmount
            .mul(_reserve0)
            .div(_reserve1);
        if (IDOLAmount <= settlementAmountInBase) {
            _addLiquidity(
                _reserve0,
                _reserve1,
                IDOLAmount,
                minShares,
                Token.TOKEN0
            );
        } else {
            _addLiquidity(
                _reserve0,
                _reserve1,
                settlementTokenAmount,
                minShares,
                Token.TOKEN1
            );
        }
    }

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
    ) external isInTime(timeout) {
        require(timeout > _currentOpenBoxId(), "Time out");
        _removeLiquidity(minBaseTokens, minSettlementTokens, sharesBurned);
    }

    /**
     * @notice Executes orders that are unexecuted
     * @param maxOrderNum Max number of orders to be executed
     **/
    function executeUnexecutedBox(uint8 maxOrderNum) external {
        _triggerExecuteOrders(maxOrderNum);
    }

    /**
     * @notice Sends market fee to Lien Token
     **/
    function sendMarketFeeToLien() external {
        _triggerPayMarketFee();
    }

    // definition of abstract functions

    function _receiveTokens(
        Token tokenType,
        address from,
        uint256 amount
    ) internal override {
        _IERC20(tokenType).safeTransferFrom(from, address(this), amount);
    }

    function _sendTokens(
        Token tokenType,
        address to,
        uint256 amount
    ) internal override {
        _IERC20(tokenType).safeTransfer(to, amount);
    }

    function _payForOrderExecution(
        Token tokenType,
        address to,
        uint256 amount
    ) internal override {
        _IERC20(tokenType).safeTransfer(to, amount);
    }

    function _isCurrentOpenBoxExpired() internal override view returns (bool) {
        return block.number >= orderBoxes[_currentOpenBoxId()].expireAt;
    }

    function _openNewBox() internal override(BoxExchange) {
        super._openNewBox();
        uint256 _boxNumber = _currentOpenBoxId();
        emit SpreadRate(
            _boxNumber.toUint128(),
            orderBoxes[_boxNumber].spreadRate
        );
    }

    function _IERC20(Token tokenType) internal view returns (ERC20Interface) {
        if (tokenType == Token.TOKEN0) {
            return idol;
        }
        return token;
    }
}

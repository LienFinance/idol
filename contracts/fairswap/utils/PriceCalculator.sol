pragma solidity 0.6.6;
import "../Interfaces/PriceCalculatorInterface.sol";
import "../Libraries/RateMath.sol";
import "../../../node_modules/@openzeppelin/contracts/math/SafeMath.sol";
import "../../../node_modules/@openzeppelin/contracts/utils/SafeCast.sol";


contract PriceCalculator is PriceCalculatorInterface {
    using RateMath for uint256;
    using SafeMath for uint256;
    using SafeCast for uint256;
    uint256 public constant TOLERANCE_RATE = 1001000000000000000; //= 100.1%
    uint256 public constant SECURE_RATE = 1050000000000000000; //105% max slippage for all orders
    uint256 public constant DECIMAL = 1000000000000000000;

    /**
     * @notice calculates and return price, and refund rates
     * @param AmountFLEX0_1 Amount of flex order of token0 to token1
     * @param AmountSTRICT0_1 Amount of strict order of token0 to token1
     * @param AmountFLEX1_0  Amount of flex order of token1 to token0
     * @param AmountSTRICT1_0 Amount of strict order of token1 to token0
     * @param reserve0 Amount of reserve0
     * @param reserve1 Amount of reserve1
     * @return [price, refundStatus, partiallyRefundRate, executed amount of token0 to token1, executed amount of token1 to token0]
     * @dev Refund for careful users if change of price is bigger than TORELANCE_RATE
     * @dev Refund for all traders if change of price is bigger than SECURE_RATE
     **/
    function calculatePrice(
        uint256 AmountFLEX0_1,
        uint256 AmountSTRICT0_1,
        uint256 AmountFLEX1_0,
        uint256 AmountSTRICT1_0,
        uint256 reserve0,
        uint256 reserve1
    ) external override view returns (uint256[5] memory) {
        require(
            reserve0 != 0 && reserve1 != 0,
            "There are no reserves. Please add liquidity or redeploy exchange"
        );
        // initial price = reserve1 / reserve0
        // price = (reserve1 + sell order amount) / (reserve0 + sell order amount)
        uint256 price = (reserve1.add(AmountFLEX1_0).add(AmountSTRICT1_0))
            .divByRate(reserve0.add(AmountFLEX0_1).add(AmountSTRICT0_1));
        // initial low Price is price of Limit order(initial price / 1.001)
        uint256 lowPrice = (reserve1.divByRate(reserve0)).divByRate(
            TOLERANCE_RATE
        );
        // initial high Price is price of Limit order(initial price * 1.001)
        uint256 highPrice = (reserve1.divByRate(reserve0)).mulByRate(
            TOLERANCE_RATE
        );
        // if initial price is within the TORELANCE_RATE, return initial price and execute all orders
        if (price > lowPrice && price < highPrice) {
            return [
                price,
                0,
                0,
                AmountFLEX0_1.add(AmountSTRICT0_1),
                AmountFLEX1_0.add(AmountSTRICT1_0)
            ];
        } else if (price <= lowPrice) {
            return
                _calculatePriceAnd0_1RefundRate(
                    price,
                    lowPrice,
                    AmountFLEX0_1,
                    AmountSTRICT0_1,
                    AmountFLEX1_0.add(AmountSTRICT1_0),
                    reserve0,
                    reserve1
                );
        } else {
            return
                _calculatePriceAnd1_0RefundRate(
                    price,
                    highPrice,
                    AmountFLEX0_1.add(AmountSTRICT0_1),
                    AmountFLEX1_0,
                    AmountSTRICT1_0,
                    reserve0,
                    reserve1
                );
        }
    }

    /**
     * @notice calculates price and refund rates if price is lower than `lowPrice`
     * @param price price which is calculated in _calculatePrice()
     * @param lowPrice reserve1 / reserve0 * 0.999
     * @param AmountFLEX0_1 Amount of no-limit token0 to token1
     * @param AmountSTRICT0_1 Amount of limit token0 to token1
     * @param all1_0Amount Amount of all token1 to token0 order. In this function, all token1 to token0 order will be executed
     * @return [price, refundStatus, partiallyRefundRate, executed amount of token0 to token1 order, executed amount of token1 to token0 order]
     **/
    function _calculatePriceAnd0_1RefundRate(
        uint256 price,
        uint256 lowPrice,
        uint256 AmountFLEX0_1,
        uint256 AmountSTRICT0_1,
        uint256 all1_0Amount,
        uint256 reserve0,
        uint256 reserve1
    ) private pure returns (uint256[5] memory) {
        // executeAmount is amount of buy orders in lowPrice(initial price * 0.999)
        uint256 executeAmount = _calculateExecuteAmount0_1(
            reserve0,
            reserve1,
            all1_0Amount,
            lowPrice
        );

        // if executeAmount > AmountFLEX0_1, (AmountFLEX0_1 - executeAmount) in limit order will be executed
        if (executeAmount > AmountFLEX0_1) {
            uint256 refundRate = (
                AmountFLEX0_1.add(AmountSTRICT0_1).sub(executeAmount)
            )
                .divByRate(AmountSTRICT0_1);
            return [lowPrice, 1, refundRate, executeAmount, all1_0Amount];
        } else {
            // refund all limit buy orders
            // update lowPrice to SECURE_RATE
            uint256 nextLowPrice = (reserve1.divByRate(reserve0)).divByRate(
                SECURE_RATE
            );
            // update price
            price = (reserve1.add(all1_0Amount)).divByRate(
                reserve0.add(AmountFLEX0_1)
            );
            if (nextLowPrice > price) {
                // executeAmount is amount of buy orders when the price is lower than lowPrice (initial price * 0.95)
                executeAmount = _calculateExecuteAmount0_1(
                    reserve0,
                    reserve1,
                    all1_0Amount,
                    nextLowPrice
                );

                // if executeAmount < AmountFLEX0_1, refund all of limit buy orders and refund some parts of no-limit buy orders
                if (executeAmount < AmountFLEX0_1) {
                    uint256 refundRate = (AmountFLEX0_1.sub(executeAmount))
                        .divByRate(AmountFLEX0_1);
                    return [
                        nextLowPrice,
                        2,
                        refundRate,
                        executeAmount,
                        all1_0Amount
                    ];
                }
            }
            // execute all no-limit buy orders and refund all limit buy orders
            return [price, 1, DECIMAL, AmountFLEX0_1, all1_0Amount];
        }
    }

    /**
     * @notice calculates price and refund rates if price is higher than highPrice
     * @param price price which is calculated in _calculatePrice()
     * @param highPrice reserve1 / reserve0 * 1.001
     * @param all0_1Amount Amount of all token0 to token1 order. In this function, all token0 to token1 order will be executed
     * @param AmountFLEX1_0  Amount of limit token0 to token1 order.
     * @param AmountSTRICT1_0 Amount of no-limit token1 to token0 order
     * @return [price, refundStatus, partiallyRefundRate, executed amount of token0 to token1 order, executed amount of token1 to token0 order]
     **/
    function _calculatePriceAnd1_0RefundRate(
        uint256 price,
        uint256 highPrice,
        uint256 all0_1Amount,
        uint256 AmountFLEX1_0,
        uint256 AmountSTRICT1_0,
        uint256 reserve0,
        uint256 reserve1
    ) private pure returns (uint256[5] memory) {
        // executeAmount is amount of sell orders when the price is higher than highPrice(initial price * 1.001)
        uint256 executeAmount = _calculateExecuteAmount1_0(
            reserve1,
            reserve0,
            all0_1Amount,
            highPrice
        );

        if (executeAmount > AmountFLEX1_0) {
            //if executeAmount > AmountFLEX1_0 , (AmountFLEX1_0  - executeAmount) in limit order will be executed
            uint256 refundRate = (
                AmountFLEX1_0.add(AmountSTRICT1_0).sub(executeAmount)
            )
                .divByRate(AmountSTRICT1_0);
            return [highPrice, 3, refundRate, all0_1Amount, executeAmount];
        } else {
            // refund all limit sell orders
            // update highPrice to SECURE_RATE
            uint256 nextHighPrice = (reserve1.divByRate(reserve0)).mulByRate(
                SECURE_RATE
            );
            // update price
            price = (reserve1.add(AmountFLEX1_0)).divByRate(
                reserve0.add(all0_1Amount)
            );
            if (nextHighPrice < price) {
                // executeAmount is amount of sell orders when the price is higher than highPrice(initial price * 1.05)
                executeAmount = _calculateExecuteAmount1_0(
                    reserve1,
                    reserve0,
                    all0_1Amount,
                    nextHighPrice
                );
                // if executeAmount < AmountFLEX1_0 , refund all of limit sell orders and refund some parts of no-limit sell orders
                if (executeAmount < AmountFLEX1_0) {
                    uint256 refundRate = (AmountFLEX1_0.sub(executeAmount))
                        .divByRate(AmountFLEX1_0);
                    return [
                        nextHighPrice,
                        4,
                        refundRate,
                        all0_1Amount,
                        executeAmount
                    ];
                }
            }
            // execute all no-limit sell orders and refund all limit sell orders
            return [price, 3, DECIMAL, all0_1Amount, AmountFLEX1_0];
        }
    }

    /**
     * @notice Calculates TOKEN0 amount to execute in price `price`
     **/
    function _calculateExecuteAmount0_1(
        uint256 reserve,
        uint256 opponentReserve,
        uint256 opppnentAmount,
        uint256 price
    ) private pure returns (uint256) {
        uint256 possibleReserve = (opponentReserve.add(opppnentAmount))
            .divByRate(price);

        if (possibleReserve > reserve) {
            return possibleReserve.sub(reserve);
        } else {
            return 0;
        }
    }

    /**
     * @notice Calculates TOKEN1 amount to execute in price `price`
     **/
    function _calculateExecuteAmount1_0(
        uint256 reserve,
        uint256 opponentReserve,
        uint256 opppnentAmount,
        uint256 price
    ) private pure returns (uint256) {
        uint256 possibleReserve = (opponentReserve.add(opppnentAmount))
            .mulByRate(price);

        if (possibleReserve > reserve) {
            return possibleReserve.sub(reserve);
        } else {
            return 0;
        }
    }
}

pragma solidity >=0.6.6;

import "./TokenBoxExchange.sol";


contract ERC20BoxExchange is TokenBoxExchange {
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
    )
        public
        TokenBoxExchange(
            _idol,
            _token,
            _priceCalc,
            _marketFeeTaker,
            _spreadCalc,
            _oracle,
            _name
        )
    {}

    // definition of abstract functions
    function _feeRate() internal override returns (uint128) {
        return spreadCalc.calculateSpreadByAssetVolatility(oracle);
    }

    function _payMarketFee(
        address _marketFeeTaker,
        uint256 amount0,
        uint256 amount1
    ) internal override {
        if (amount0 != 0) {
            idol.safeTransfer(_marketFeeTaker, amount0);
        }
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
    ) internal virtual override {
        uint256 newReserve0;
        uint256 newReserve1;
        uint256 newMarketFeePool0;
        uint256 marketFee1;
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
            (newReserve1, marketFee1) = _calculateNewReserveAndMarketFeePool(
                spreadRate,
                executingAmount1WithoutSpread,
                executingAmount0WithoutSpread,
                rate,
                Token.TOKEN1
            );
            newReserve1 = newReserve1 + reserve1;
        }

        {
            uint256 convertedSpread1to0 = marketFee1
                .mulByRate(newReserve0.divByRate(newReserve1.add(marketFee1)))
                .divByRate(RateMath.RATE_POINT_MULTIPLIER);
            newReserve1 = newReserve1 + marketFee1;
            newReserve0 = newReserve0 - convertedSpread1to0;
            newMarketFeePool0 = newMarketFeePool0 + convertedSpread1to0;
        }
        _updateReserve(newReserve0.toUint128(), newReserve1.toUint128());
        _updateMarketFeePool(newMarketFeePool0.toUint128());
    }

    /**
     * updates only pool0
     */
    function _updateMarketFeePool(uint256 newMarketFeePool0) internal {
        marketFeePool0 = newMarketFeePool0.toUint128();
    }
}

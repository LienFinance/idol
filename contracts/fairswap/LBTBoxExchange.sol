pragma solidity 0.6.6;

import "./TokenBoxExchange.sol";
import "./Interfaces/LBTInterface.sol";


contract LBTBoxExchange is TokenBoxExchange {
    uint256 public immutable maturity; // maturity of LBT
    uint256 public immutable strikePrice; // strikePrice of LBT
    bool public immutable isNormalLBT;

    event RemoveAfterMaturity(
        address indexed liquidityProvider,
        uint256 indexed ethAmount,
        uint256 indexed baseTokenAmount
    );

    /**
     * @param _idol iDOL contract
     * @param _lbt LBT contract
     * @param _priceCalc Price Calculator contract
     * @param _marketFeeTaker Address of market fee taker (i.e. Lien Token)
     * @param _spreadCalc Spread Calculator contract
     * @param _oracle ETH/USD oracle contract
     * @param _isNormalLBT Target LBT is normal or not
     * @param _maturity Maturity of LBT
     * @param _strikePrice Strike price of LBT
     * @param _name Name of share token
     **/
    constructor(
        ERC20Interface _idol,
        ERC20Interface _lbt,
        PriceCalculatorInterface _priceCalc,
        address _marketFeeTaker,
        SpreadCalculatorInterface _spreadCalc,
        OracleInterface _oracle,
        bool _isNormalLBT,
        uint256 _maturity,
        uint256 _strikePrice,
        string memory _name
    )
        public
        TokenBoxExchange(
            _idol,
            _lbt,
            _priceCalc,
            _marketFeeTaker,
            _spreadCalc,
            _oracle,
            _name
        )
    {
        maturity = _maturity;
        strikePrice = _strikePrice;
        isNormalLBT = _isNormalLBT;
    }

    // Revert if eth sender is not LBT
    receive() external payable {
        require(
            msg.sender == address(token),
            "Only LBT contract can transfer ETH"
        );
    }

    /**
     * @notice Removes liquidity after maturity of the LBT. All share token LP has is burned and converted to ETH.
     **/
    function removeAfterMaturity() public {
        require(now > maturity, "LBT not expired");
        uint256 share = balanceOf(msg.sender);
        uint256 totalShare = totalSupply();
        uint256 idolAmount = (uint256(reserve0).mul(share)).div(totalShare);
        uint256 lbtAmount = (uint256(reserve1).mul(share)).div(totalShare);
        _updateReserve(
            reserve0 - idolAmount.toUint128(),
            reserve1 - lbtAmount.toUint128()
        );
        _burn(msg.sender, share);
        LBTInterface lbt = LBTInterface(address(token));
        bool success = lbt.burn(lbtAmount);
        require(success, "LBT not liquidated");
        uint256 ethAmount = address(this).balance;
        emit RemoveAfterMaturity(msg.sender, ethAmount, idolAmount);
        idol.safeTransfer(msg.sender, idolAmount);
        _transferEth(msg.sender, ethAmount);
    }

    // definition of abstract functions
    function _feeRate() internal override returns (uint128) {
        if (block.timestamp > maturity) {
            return spreadCalc.calculateSpreadByAssetVolatility(oracle);
        } else if (isNormalLBT) {
            return
                spreadCalc.calculateCurrentSpread(
                    maturity,
                    strikePrice * (10**14), // decimal of strikePrice is 4
                    oracle
                );
        } else {
            return 3000000000000000;
        }
    }

    function _payMarketFee(
        address marketFeeRecipient,
        uint256 idolAmount,
        uint256 lbtAmount
    ) internal override {
        require(now > maturity, "LBT not expired");
        idol.transfer(marketFeeRecipient, idolAmount);
        LBTInterface lbt = LBTInterface(address(token));
        if (lbtAmount != 0) {
            bool success = lbt.burn(lbtAmount);
            require(success, "LBT not liquidated");
            uint256 ethAmount = address(this).balance;
            _transferEth(payable(marketFeeRecipient), ethAmount);
        }
    }

    function _transferEth(address payable to, uint256 amount) private {
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, ) = to.call{value: amount}("");
        require(success, "Transfer failed.");
    }
}

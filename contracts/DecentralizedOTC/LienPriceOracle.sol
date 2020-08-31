pragma solidity 0.6.6;

import "../../node_modules/@openzeppelin/contracts/math/SafeMath.sol";


interface BoxExchangeInterface {
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
}


interface IDOLContract {
    function calcSBT2IDOL(uint256 solidBondValueE12)
        external
        view
        returns (uint256 IDOLAmountE8);
}


/**
 * @dev This oracle contract provides lien's USD price at FairSwap to users and DecentralizedOTC pool.
 * LOWEST_PRICE can be set by the deployer in order to prevent price manipulations at FairSwap.
 */

contract LienPriceOracle {
    using SafeMath for uint256;

    BoxExchangeInterface fairSwap;
    IDOLContract idol;
    uint256 public LOWEST_PRICE;
    address public deployer;

    constructor(address fairSwapLienIDOL, address IDOL) public {
        fairSwap = BoxExchangeInterface(fairSwapLienIDOL);
        idol = IDOLContract(IDOL);
        deployer = msg.sender;
    }

    function setLowestPrice(uint256 priceE4) public {
        require(
            msg.sender == deployer,
            "only deployer is allowed to change LOWEST_PRICE"
        );
        LOWEST_PRICE = priceE4;
    }

    /**
     * @dev calculate the pool ratio LIEN vs IDOL at FairSwap.
     */

    function getPrice() public view returns (uint256 lienPriceDollarE4) {
        (, uint256 _IDOLPoolAmount, uint256 _lienPoolAmount, , , , ) = fairSwap
            .getExchangeData();

        //uint256 lienPriceIDOLE8 = _IDOLPoolAmount.div(_lienPoolAmount);
        uint256 lambdaE8 = idol.calcSBT2IDOL(10**12);

        lienPriceDollarE4 = _IDOLPoolAmount.mul(10**12).div(lambdaE8).div(
            _lienPoolAmount
        );
        if (lienPriceDollarE4 < LOWEST_PRICE) {
            lienPriceDollarE4 = LOWEST_PRICE;
        }
    }
}

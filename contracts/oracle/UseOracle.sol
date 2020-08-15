pragma solidity 0.6.6;

import "./OracleInterface.sol";


abstract contract UseOracle {
    OracleInterface internal _oracleContract;

    constructor(address contractAddress) public {
        require(
            contractAddress != address(0),
            "contract should be non-zero address"
        );
        _oracleContract = OracleInterface(contractAddress);
    }

    /// @notice Get the latest USD/ETH price and historical volatility using oracle.
    /// @return rateETH2USDE8 (10^-8 USD/ETH)
    /// @return volatilityE8 (10^-8)
    function _getOracleData()
        internal
        returns (uint256 rateETH2USDE8, uint256 volatilityE8)
    {
        rateETH2USDE8 = _oracleContract.latestPrice();
        volatilityE8 = _oracleContract.getVolatility();

        return (rateETH2USDE8, volatilityE8);
    }

    /// @notice Get the price of the oracle data with a minimum timestamp that does more than input value
    /// when you know the ID you are looking for.
    /// @param timestamp is the timestamp that you want to get price.
    /// @param hintID is the ID of the oracle data you are looking for.
    /// @return rateETH2USDE8 (10^-8 USD/ETH)
    function _getPriceOn(uint256 timestamp, uint256 hintID)
        internal
        returns (uint256 rateETH2USDE8)
    {
        uint256 latestID = _oracleContract.latestId();
        require(
            latestID != 0,
            "system error: the ID of oracle data should not be zero"
        );

        require(hintID != 0, "the hint ID must not be zero");
        uint256 id = hintID;
        if (hintID > latestID) {
            id = latestID;
        }

        require(
            _oracleContract.getTimestamp(id) > timestamp,
            "there is no price data after maturity"
        );

        id--;
        while (id != 0) {
            if (_oracleContract.getTimestamp(id) <= timestamp) {
                break;
            }
            id--;
        }

        return _oracleContract.getPrice(id + 1);
    }
}

pragma solidity 0.6.6;

import "../math/UseSafeMath.sol";
import "../util/Time.sol";
import "./OracleInterface.sol";


contract TestOracle is UseSafeMath, Time, OracleInterface {
    uint256 immutable _createdAt;

    uint256[] private _timestamp;

    /// @notice 10^8 USD/ETH
    uint256[] private _rateETH2USD;

    /// @notice 10^8
    uint256[] private _volatility;

    constructor(uint256 rateETH2USD, uint256 volatility) public {
        uint256 createdAt = _getBlockTimestampSec();
        _createdAt = createdAt;
        _rateETH2USD.push(0);
        _volatility.push(0);
        _timestamp.push(0);
        _rateETH2USD.push(rateETH2USD);
        _volatility.push(volatility);
        _timestamp.push(createdAt);
    }

    function testSetOracleData(uint256 rateETH2USD, uint256 volatility) public {
        _rateETH2USD.push(rateETH2USD);
        _volatility.push(volatility);
        _timestamp.push(_getBlockTimestampSec());
    }

    function alive() external override view returns (bool) {
        return true;
    }

    function latestId() public override returns (uint256 id) {
        return _rateETH2USD.length - 1;
    }

    function latestPrice() external override returns (uint256 rateETH2USD) {
        return getPrice(latestId());
    }

    function latestTimestamp() external override returns (uint256 timestamp) {
        return getTimestamp(latestId());
    }

    function getPrice(uint256 id)
        public
        override
        returns (uint256 rateETH2USD)
    {
        require(id <= latestId(), "given ID exceeds latest ID");
        return _rateETH2USD[id];
    }

    function getTimestamp(uint256 id)
        public
        override
        returns (uint256 timestamp)
    {
        require(id <= latestId(), "given ID exceeds latest ID");
        return _timestamp[id];
    }

    function getVolatility() external override returns (uint256 volatility) {
        return _volatility[latestId()];
    }
}

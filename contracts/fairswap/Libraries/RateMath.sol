pragma solidity 0.6.6;

import "../../../node_modules/@openzeppelin/contracts/math/SafeMath.sol";


library RateMath {
    using SafeMath for uint256;
    uint256 public constant RATE_POINT_MULTIPLIER = 1000000000000000000; // 10^18

    function getRate(uint256 a, uint256 b) internal pure returns (uint256) {
        return a.mul(RATE_POINT_MULTIPLIER).div(b);
    }

    function divByRate(uint256 self, uint256 rate)
        internal
        pure
        returns (uint256)
    {
        return self.mul(RATE_POINT_MULTIPLIER).div(rate);
    }

    function mulByRate(uint256 self, uint256 rate)
        internal
        pure
        returns (uint256)
    {
        return self.mul(rate).div(RATE_POINT_MULTIPLIER);
    }
}

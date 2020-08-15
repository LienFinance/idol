pragma solidity ^0.6.6;

import "./Digits.sol";


contract TestDigits {
    using Digits for uint256;

    function testToDigitsString(uint256 value, uint256 digits)
        external
        pure
        returns (string memory)
    {
        return value.toString(digits);
    }
}

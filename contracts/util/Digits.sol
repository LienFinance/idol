pragma solidity ^0.6.6;


library Digits {
    /**
     * @notice represent given number to `digits` digits string
     */
    function toString(uint256 value, uint256 digits)
        internal
        pure
        returns (string memory)
    {
        // solium-disable-previous-line security/no-assign-params
        bytes memory buffer = new bytes(digits);
        while (digits != 0) {
            digits--;
            buffer[digits] = bytes1(uint8(48 + (value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}

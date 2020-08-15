pragma solidity 0.6.6;


contract TestERC20Oracle {
    function getPrice() public pure returns (uint256) {
        return 100000;
    }
}

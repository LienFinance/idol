pragma solidity 0.6.6;


interface ERC20OracleInterface {
    function getPrice() external view returns (uint256);
}

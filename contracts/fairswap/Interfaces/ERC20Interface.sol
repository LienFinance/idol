pragma solidity 0.6.6;
import "../../../node_modules/@openzeppelin/contracts/token/ERC20/IERC20.sol";


interface ERC20Interface is IERC20 {
    function name() external view returns (string memory);
}

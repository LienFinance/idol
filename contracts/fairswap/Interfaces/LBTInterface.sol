pragma solidity 0.6.6;

import "../../../node_modules/@openzeppelin/contracts/token/ERC20/IERC20.sol";


interface LBTInterface is IERC20 {
    function burn(uint256 _amount) external returns (bool);
}

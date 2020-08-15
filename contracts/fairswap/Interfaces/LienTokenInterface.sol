pragma solidity 0.6.6;
import "../../../node_modules/@openzeppelin/contracts/token/ERC20/IERC20.sol";


interface LienTokenInterface is IERC20 {
    function currentTerm() external view returns (uint256);

    function expiration() external view returns (uint256);

    function receiveDividend(address token, address recipient) external;

    function receiveDividendOfEth(address recipient) external;

    function dividendAt(
        address token,
        address account,
        uint256 term
    ) external view returns (uint256);

    function dividendOfEthAt(address account, uint256 term)
        external
        view
        returns (uint256);
}

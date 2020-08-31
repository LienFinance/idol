pragma solidity 0.6.6;

import "./ERC20BoxExchange.sol";


interface ERC20ExchangeFactoryInterface {
    function launchExchange(
        ERC20Interface token,
        uint256 iDOLAmount,
        uint256 tokenAmount,
        uint256 initialShare,
        OracleInterface oracle
    ) external returns (address exchange);

    function initializeExchange(
        ERC20Interface token,
        address oracleAddress,
        uint256 iDOLAmount,
        uint256 tokenAmount,
        uint256 initialShare
    ) external;
}

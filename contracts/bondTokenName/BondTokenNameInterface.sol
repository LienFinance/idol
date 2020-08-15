pragma solidity ^0.6.6;


/**
 * @title bond token name contract interface
 */
interface BondTokenNameInterface {
    function genBondTokenName(
        string calldata shortNamePrefix,
        string calldata longNamePrefix,
        uint256 maturity,
        uint256 solidStrikePriceE4
    ) external pure returns (string memory shortName, string memory longName);

    function getBondTokenName(
        uint256 maturity,
        uint256 solidStrikePriceE4,
        uint256 rateLBTWorthlessE4
    ) external pure returns (string memory shortName, string memory longName);
}

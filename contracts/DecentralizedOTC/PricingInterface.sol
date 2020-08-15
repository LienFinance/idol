pragma solidity 0.6.6;


interface PricingInterface {
    function pricing(
        int256 etherPriceE4,
        int256 volE8,
        int256 liquidStrikePriceE4,
        int256 maturity
    ) external view returns (uint256);
}

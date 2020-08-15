pragma solidity 0.6.6;


interface SolidBondSafetyInterface {
    function getEmergencyBorderInfo(uint256 xxE8)
        external
        pure
        returns (int256 aaE4, int256 bE4);

    /// @param rateETH2USD S * 10^8 (USD/ETH)
    /// @param solidBondStrikePrice K * 10^4 (USD/SBT)
    /// @param volatility v * 10^8
    /// @param untilMaturity t (= T * 365 * 86400)
    function isInEmergency(
        uint256 rateETH2USD,
        uint256 solidBondStrikePrice,
        uint256 volatility,
        uint256 untilMaturity
    ) external pure returns (bool);

    /// @param rateETH2USD S * 10^8 (USD/ETH)
    /// @param solidBondStrikePrice K * 10^4  (USD/SBT)
    /// @param volatility v * 10^8
    /// @param untilMaturity t (= T * 365 * 86400)
    function isDangerSolidBond(
        uint256 rateETH2USD,
        uint256 solidBondStrikePrice,
        uint256 volatility,
        uint256 untilMaturity
    ) external pure returns (bool);
}

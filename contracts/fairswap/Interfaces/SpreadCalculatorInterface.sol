pragma solidity 0.6.6;
import "../../oracle/OracleInterface.sol";


interface SpreadCalculatorInterface {
    function calculateCurrentSpread(
        uint256 _maturity,
        uint256 _strikePrice,
        OracleInterface oracle
    ) external returns (uint128);

    function calculateSpreadByAssetVolatility(OracleInterface oracle)
        external
        returns (uint128);
}

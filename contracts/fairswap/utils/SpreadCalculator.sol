pragma solidity 0.6.6;
import "../Interfaces/SpreadCalculatorInterface.sol";
import "../../oracle/OracleInterface.sol";
import "../Libraries/RateMath.sol";
import "../../../node_modules/@openzeppelin/contracts/math/SafeMath.sol";
import "../../../node_modules/@openzeppelin/contracts/utils/SafeCast.sol";


contract SpreadCalculator is SpreadCalculatorInterface {
    using RateMath for uint256;
    using SafeMath for uint256;
    using SafeCast for uint256;

    uint256 public constant SPREAD_RATE = 3000000000000000; //= 0.3%
    uint256 public constant DECIMAL = 1000000000000000000;
    uint256 public constant TEN_DIGITS = 10000000000;
    uint256 public constant MAX_RATIONAL_ORACLE_VALUE = 100000000000000000000000; // too much volatility or ETH price

    // parameters of approximate expression of Black-Scholes equation that calculates LBT volatility
    // 'X4' is unused parameter because minimum spread rate is 0.3 %
    uint256 public constant ALPHA1 = 6085926862470381000;
    uint256 public constant ALPHA2 = 2931875257585468700;
    uint256 public constant MAX_EXECUTE_ACCOUNT = 5;
    uint256 public constant ALPHA3 = 2218732501079067300;
    int256 public constant BETA1 = 1406874237416828400;
    int256 public constant BETA2 = 1756430504093997600;
    int256 public constant BETA3 = 2434962998012975000;
    uint256 public constant COEF1 = 226698973741174460000;
    uint256 public constant COEF2 = 14143621388702120000;
    uint256 public constant COEF3 = 3191869733673552600;
    //uint256 public constant COEF4 = 194954040017071670;
    uint256 public constant COEFSIG1 = 1332906524709810000000;
    uint256 public constant COEFSIG2 = 39310196066041410000;
    uint256 public constant COEFSIG3 = 7201026361442427000;
    //uint256 public constant COEFSIG4 = 551672108932873900;
    uint256 public constant INTERCEPT1 = 327997870106653860000;
    uint256 public constant INTERCEPT2 = 28959220856904096000;
    uint256 public constant INTERCEPT3 = 9723230176749988000;
    //uint256 public constant INTERCEPT4 = 2425851354532068300;
    uint256 public constant ROOTEDYEARINSECOND = 5615;
    event CalculateSpread(
        uint256 indexed price,
        uint256 indexed volatility,
        uint256 indexed spread
    );

    /**
     * @notice Spread rate calculation
     * @param maturity Maturity of option token
     * @param strikePrice Strikeprice of option token
     * @return spreadRate Spread rate of this option token
     * @dev S/K is Price of ETH / strikeprice
     * @dev Spread is difined by volatility of LBT which is approached by linear equation (intercept - coef * S/K - coefsig * vol * t^0.5)
     * @dev Coefficient and intercept of linear equation are determined by S/K(and alpha - beta * vol * t^0.5)
     **/
    function calculateCurrentSpread(
        uint256 maturity,
        uint256 strikePrice,
        OracleInterface oracle
    ) external override returns (uint128) {
        uint256 spreadRate = SPREAD_RATE;
        if (address(oracle) == address(0)) {
            emit CalculateSpread(0, 0, spreadRate);
            return uint128(spreadRate);
        }
        uint256 ethPrice = oracle.latestPrice().mul(TEN_DIGITS);
        uint256 volatility = oracle.getVolatility().mul(TEN_DIGITS);

        if (
            ethPrice > MAX_RATIONAL_ORACLE_VALUE ||
            volatility > MAX_RATIONAL_ORACLE_VALUE
        ) {
            emit CalculateSpread(ethPrice, volatility, spreadRate);
            return uint128(spreadRate);
        }
        uint256 time = (_sqrt(maturity - block.timestamp).mul(DECIMAL)).div(
            ROOTEDYEARINSECOND
        );
        uint256 sigTime = volatility.mulByRate(time);
        uint256 ratio = ethPrice.divByRate(strikePrice);
        if (int256(ratio) <= BETA1 - int256(ALPHA1.mulByRate(sigTime))) {
            spreadRate = (
                SPREAD_RATE.mulByRate(
                    _caluculateZ(COEF1, COEFSIG1, INTERCEPT1, ratio, sigTime)
                )
            );
        } else if (int256(ratio) <= BETA2 - int256(ALPHA2.mulByRate(sigTime))) {
            spreadRate = (
                SPREAD_RATE.mulByRate(
                    _caluculateZ(COEF2, COEFSIG2, INTERCEPT2, ratio, sigTime)
                )
            );
        } else if (int256(ratio) <= BETA3 - int256(ALPHA3.mulByRate(sigTime))) {
            spreadRate = (
                SPREAD_RATE.mulByRate(
                    _caluculateZ(COEF3, COEFSIG3, INTERCEPT3, ratio, sigTime)
                )
            );
        }
        emit CalculateSpread(ethPrice, volatility, spreadRate);
        return spreadRate.toUint128();
        // if S/K is under first tolerance difined by COEF4, COEFSIG4, INTERCEPT4, returns 0.3%
        /*
        else {
            uint256 spreadRate = SPREAD_RATE.mulByRate(_caluculateZ(COEF4, COEFSIG4, INTERCEPT4, ratio, sigTime));
            return uint64(spreadRate);
        }
        return uint64(SPREAD_RATE);
        */
    }

    /**
     * @notice If volatility of asset pair is over 200%, spread rate becomes variable
     **/
    function calculateSpreadByAssetVolatility(OracleInterface oracle)
        external
        override
        returns (uint128)
    {
        if (address(oracle) == address(0)) {
            return uint128(SPREAD_RATE);
        }
        uint256 volatility = oracle.getVolatility().mul(TEN_DIGITS);
        if ((DECIMAL * 100) > volatility && (DECIMAL * 2) < volatility) {
            return SPREAD_RATE.mulByRate(volatility).div(2).toUint128();
        } else if (DECIMAL * 100 <= volatility) {
            return uint128(SPREAD_RATE * 50);
        }
        return uint128(SPREAD_RATE);
    }

    /**
     * @notice Approximate expression of option token volatility
     * @param coef Coefficient of S/K in the linear equation
     * @param coefsig Coefficient of vol * t^0.5 in the linear equation
     * @param intercept Intercept in the linear equation
     * @param ratio S/K
     * @param sigTime vol * t^0.5
     * @dev Spread is difined by volatility of LBT which is approached by linear equation (intercept - coef * S/K - coefsig * vol * t^0.5)
     * @dev Coefficient and intercept of linear equation is determined by S/k(and alpha - beta * vol * t^0.5)
     * @dev spread = 0.3 * v / 2
     **/
    function _caluculateZ(
        uint256 coef,
        uint256 coefsig,
        uint256 intercept,
        uint256 ratio,
        uint256 sigTime
    ) private pure returns (uint256) {
        uint256 z = intercept.sub(ratio.mulByRate(coef)).sub(
            sigTime.mulByRate(coefsig)
        );
        if (z <= 2 * DECIMAL) {
            return DECIMAL;
        } else if (z >= DECIMAL.mul(100)) {
            return DECIMAL * 50;
        }
        return z.div(2);
    }

    /**
     * @notice Calculate square root of uint
     **/
    function _sqrt(uint256 x) private pure returns (uint256 y) {
        uint256 z = (x + 1) / 2;
        y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }
}

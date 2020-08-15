pragma solidity 0.6.6;

import "../math/UseSafeMath.sol";
import "../util/Time.sol";


// This contract is used for calculating minimum threshold acceptable strike price (relative to the current oracle price)
// for the SBT with the time to maturity and the volatility from oracle.
// It is derived from the risk appetite of this protocol.
// For volatile SBT due to the long time to maturity or the underlying ETH volatility,
// the minimum threshold acceptable strike price needs to increase in order to mitigate the risk of emergency auction.
// The policy in this protocol is to equalize the risk of acceptable SBT over the different time to maturity or the underlying ETH volatility.
// The threshold is thus derived from solving the black-scholes formula with a linear approximation technique.
// Even in the approximation of the formula, there remains square root of time, which is tricky to handle in solidity.
// Hence, we deal with the value in the squared form of the value.
// In the following notations, for example, vvtE16 represents v^2 * t * 10^16.
abstract contract SolidBondSafety is UseSafeMath, Time {
    /// @notice The return values of getEmergencyBorderInfo are intermediate values
    /// used for checking if the SBT is acceptable to the IDOL contract.
    /// Let f(x) = a*x + b be the function defined below:
    /// f(x) =            1.1    for 0      <= x <= 0.3576
    /// f(x) =  1.52 x +  0.5564 for 0.3576 < x <= 0.7751
    /// f(x) =  6.4  x -  3.226  for 0.7751 < x <= 1.1562
    /// f(x) = 14.27 x - 12.3256 for 1.1562 < x <= 1.416
    /// f(x) = 29.13 x - 33.3676 for 1.416  < x <= 1.6257
    /// f(x) = 53.15 x - 72.4165 for 1.6257 < x <= 1.8
    /// Then, we define getEmergencyBorderInfo(x^2 * 10^8) = (a^2 * 10^4, b * 10^4).
    /// @param  xxE8 is multiply 10^8 with the square of x
    /// @return aaE4 is multiply 10000 with the square of a
    /// @return bE4  is multiply 10000 with b
    function getEmergencyBorderInfo(uint256 xxE8)
        public
        pure
        returns (int256 aaE4, int256 bE4)
    {
        if (xxE8 <= 3576 * 3576) {
            return (0, 11000);
        } else if (xxE8 <= 7751 * 7751) {
            return (152 * 152, 5564);
        } else if (xxE8 <= 11562 * 11562) {
            return (640 * 640, -32260);
        } else if (xxE8 <= 14160 * 14160) {
            return (1427 * 1427, -123256);
        } else if (xxE8 <= 16257 * 16257) {
            return (2913 * 2913, -333676);
        } else if (xxE8 <= 18000 * 18000) {
            return (5315 * 5315, -724165);
        } else {
            revert("not acceptable");
        }
    }

    /// @param rateETH2USD S * 10^8 (USD/ETH)
    /// @param solidBondStrikePrice K * 10^4 (USD/SBT)
    /// @param volatility v * 10^8
    /// @param untilMaturity t (= T * 365 * 86400)
    // isInEmergency checks if the SBT should be put into emergency auction.
    // The condition is verified by utilizing approximate form of black-scholes formula.
    function isInEmergency(
        uint256 rateETH2USD,
        uint256 solidBondStrikePrice,
        uint256 volatility,
        uint256 untilMaturity
    ) public pure returns (bool) {
        uint256 vE8 = volatility;
        if (vE8 > 2 * 10**8) {
            vE8 = 2 * 10**8; // The volatility is too high.
        }
        if (untilMaturity >= 12 weeks) {
            return true; // The period until maturity is too long.
        }
        uint256 vvtE16 = vE8.mul(vE8).mul(untilMaturity);

        uint256 xxE8 = vvtE16 / (64 * 10**6 * 86400 * 365); // 1.25^2 / 10^8 = 1 / (64 * 10^6)
        (int256 aaE4, int256 bE4) = getEmergencyBorderInfo(xxE8);
        int256 sE8 = rateETH2USD.toInt256();
        int256 kE4 = solidBondStrikePrice.toInt256();
        int256 cE8 = sE8.sub(bE4.mul(kE4));
        // int256 lE28 = cE8.mul(cE8).mul(20183040 * 10**12);
        int256 rE28 = int256(vvtE16).mul(aaE4).mul(kE4).mul(kE4);
        bool isDanger = cE8 <= 0 || cE8.mul(cE8).mul(20183040 * 10**12) <= rE28;
        return isDanger;
    }

    /// @param rateETH2USD S * 10^8 (USD/ETH)
    /// @param solidBondStrikePrice K * 10^4  (USD/SBT)
    /// @param volatility v * 10^8
    /// @param untilMaturity t (= T * 365 * 86400)
    // isDangerSolidBond checks if the SBT is acceptable to be a part of IDOL.
    // The condition is verified by utilizing approximate form of black-scholes formula.
    // This condition is more strict than the condition for triggering emergency auction described in isInEmergency function above.
    function isDangerSolidBond(
        uint256 rateETH2USD,
        uint256 solidBondStrikePrice,
        uint256 volatility,
        uint256 untilMaturity
    ) public pure returns (bool) {
        if (
            solidBondStrikePrice * 5 * 10**4 < rateETH2USD * 2 &&
            untilMaturity < 2 weeks
        ) {
            return false;
        } else if (volatility > 2 * 10**8) {
            return true; // The volatility is too high.
        }
        if (untilMaturity >= 12 weeks) {
            return true; // The period until maturity is too long.
        }
        uint256 vvtE16 = volatility.mul(volatility).mul(untilMaturity);

        uint256 xxE8 = vvtE16 / (64 * 10**6 * 86400 * 365); // 1.25^2 / 10^8 = 1 / (64 * 10^6)
        (int256 aaE4, int256 bE4) = getEmergencyBorderInfo(xxE8);
        //                                            S/K <= 1.5f(1.25*v*sqrt(T))
        // <=>                                        S/K <= 1.5(1.25a*v*sqrt(T) + b)
        // <=>                                 (2S - 3bK) <= (3.75aKv) * sqrt(T)
        // if 2S > 3bK,
        //                                   (2S - 3bK)^2 <= (3.75aKv)^2 * t / 365 / 86400
        // <=>                       20183040(2S - 3bK)^2 <= 9t(aKv)^2
        // <=> 20183040 * 10^12(10^8 * 2S - 10^8 * 3bK)^2 <= 9 * 10000a^2 * (10000K)^2 * t(10^8 * v)^2
        int256 sE8 = rateETH2USD.toInt256();
        int256 kE4 = solidBondStrikePrice.toInt256();
        int256 cE8 = sE8.mul(2).sub(bE4.mul(kE4).mul(3));
        // int256 lE28 = cE8.mul(cE8).mul(20183040 * 10**12);
        int256 rE28 = int256(vvtE16).mul(aaE4).mul(kE4).mul(kE4).mul(9);
        bool isDanger = cE8 <= 0 || cE8.mul(cE8).mul(20183040 * 10**12) <= rE28;
        return isDanger;
    }
}

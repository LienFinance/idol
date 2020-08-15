pragma solidity 0.6.6;

import "../math/UseSafeMath.sol";


contract LBTPricing is UseSafeMath {
    int256 internal constant ONEE4 = 10**4;

    /**
     * @dev sqrt(365*86400) * 10^8
     */
    int256 internal constant SQRT_YEAR_E8 = 561569229926;

    /**
     * @dev sqrt(2*PI) * 10^8
     */
    int256 internal constant SQRT_2PI_E8 = 250662827;

    /**
     * @notice Calcurate the exponent of the int256 value.
     * WARNING: 10**8 is of uint256 type, but _pow(10, 8) is of int256 type.
     * @dev If y is zero, z is 1 whatever x is.
     */
    function _pow(int256 x, uint256 y) internal pure returns (int256 z) {
        z = 1;
        for (uint256 i = 0; i < y; i++) {
            z = z.mul(x);
        }
    }

    /**
     * @dev Calcurate an approximate value of the square root of x by Newton's method.
     */
    function _sqrt(int256 x) internal pure returns (int256 y) {
        require(
            x >= 0,
            "cannot calculate the square root of a negative number"
        );
        int256 z = (x + 1) / 2;
        y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }

    /**s
     * @notice Calculate an approximate value of the logarithm of input value by
     * Taylor expansion.
     * @dev log(x + 1) = x - 1/2 x^2 + 1/3 x^3 - 1/4 x^4 + 1/5 x^5
     *                     - 1/6 x^6 + 1/7 x^7 - 1/8 x^8 + ...
     */
    function _logTaylor(int256 inputE4)
        internal
        pure
        returns (int256 outputE4)
    {
        outputE4 = 0;
        int256 sign;
        require(inputE4 < 2 * 10**4, "inputE4 < 20000 (2) is required");
        for (uint256 i = 1; i < 9; i++) {
            if (i % 2 == 0) {
                sign = -1;
            } else {
                sign = 1;
            }
            outputE4 = outputE4.add(
                _pow(inputE4, i).div(_pow(10, 4 * i - 4)).div(int256(i)).mul(
                    sign
                )
            );
        }
    }

    /**
     * @notice Calculate the cumulative distribution function of standard normal
     * distribution by Taylor expansion.
     * @dev N(x)
     *    = exp(-(x^2)/2) / sqrt(2*PI)
     *    = 1/2 + (x - 1/6 x^3 + 1/40 x^5 - 1/330 x^7 + 3456 x^9 - ...)/sqrt(2*PI)
     */
    function _NTaylor(int256 inputE4) internal pure returns (int256 outputE4) {
        int256 t = inputE4
            .sub(_pow(inputE4, 3).div(6 * 10**8))
            .add(_pow(inputE4, 5).div(40 * 10**16))
            .sub(_pow(inputE4, 7).div(330 * 10**24))
            .add(_pow(inputE4, 9).div(3456 * 10**32));
        return t.mul(10**8).div(SQRT_2PI_E8).add(5 * 10**3);
    }

    /**
     * @dev
     * s := v*sqrt(t/365*86400)
     * d1 := log(S/K - 1)/s + s/2
     * d2 := d1 - ss
     * price :=
     *   | S*NTaylor(d1) - K*NTaylor(d2) (if 0.7 <= S/K <= 2 & -2 < d1 < 2 & -2 < d2 < 2)
     *   | max(S - K, 0)                 (otherwise).
     */
    function pricing(
        int256 rateETH2USDE4,
        int256 liquidStrikePriceE4,
        int256 volatility,
        int256 untilMaturity
    ) public pure returns (int256) {
        int256 pE4 = rateETH2USDE4.mul(ONEE4).div(liquidStrikePriceE4);
        int256 sigE8 = volatility
            .mul(_sqrt(untilMaturity))
            .mul(_pow(10, 8))
            .div(SQRT_YEAR_E8);

        if (pE4 <= 7000 || pE4 >= 20000) {
            if (liquidStrikePriceE4 < rateETH2USDE4) {
                return rateETH2USDE4.sub(liquidStrikePriceE4);
            } else {
                return 0;
            }
        }

        int256 d1E4 = _logTaylor(pE4.sub(ONEE4)).mul(10**8).div(sigE8).add(
            sigE8.div(2 * 10**4)
        );
        int256 d2E4 = d1E4.sub(sigE8.div(ONEE4));

        if (
            d1E4 > -2 * ONEE4 &&
            d1E4 < 2 * ONEE4 &&
            d2E4 > -2 * ONEE4 &&
            d2E4 < 2 * ONEE4
        ) {
            return
                rateETH2USDE4
                    .mul(_NTaylor(d1E4))
                    .sub(liquidStrikePriceE4.mul(_NTaylor(d2E4)))
                    .div(10**4);
        } else if (liquidStrikePriceE4 < rateETH2USDE4) {
            return rateETH2USDE4.sub(liquidStrikePriceE4);
        } else {
            return 0;
        }
    }
}

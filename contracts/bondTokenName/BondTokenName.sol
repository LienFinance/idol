pragma solidity ^0.6.6;

import "./BondTokenNameInterface.sol";
import "../../node_modules/@openzeppelin/contracts/utils/Strings.sol";
import "../util/Digits.sol";
import "../util/DateTimeLibrary.sol";


/**
 * @title bond token name contract
 * @notice generate the name of bond token from its bond property
 */
contract BondTokenName is BondTokenNameInterface {
    using Strings for uint256;
    using Digits for uint256;
    using DateTimeLibrary for uint256;

    /**
     * @notice generate a bond token name with exactly 12 letters and a long bond token name
     */
    function genBondTokenName(
        string memory shortNamePrefix,
        string memory longNamePrefix,
        uint256 maturity,
        uint256 solidStrikePriceE4
    )
        public
        override
        pure
        returns (string memory shortName, string memory longName)
    {
        uint256 solidStrikePriceE0 = solidStrikePriceE4 / (10**4);
        (uint256 year, uint256 month, uint256 day) = maturity.timestampToDate();
        string memory yearStr = year.toString(4);
        string memory monthStr = month.toString(2);
        string memory dayStr = day.toString(2);
        {
            string memory shortDateStr = string(
                abi.encodePacked(monthStr, dayStr)
            );
            string memory shortStrikePriceStr = solidStrikePriceE0.toString(4);

            shortName = string(
                abi.encodePacked(
                    shortNamePrefix,
                    shortDateStr,
                    "",
                    shortStrikePriceStr
                )
            );
        }
        {
            string memory dateStr = string(
                abi.encodePacked(yearStr, monthStr, dayStr)
            );
            string memory strikePriceStr = solidStrikePriceE0.toString();
            longName = string(
                abi.encodePacked(
                    longNamePrefix,
                    " ",
                    dateStr,
                    " ",
                    strikePriceStr
                )
            );
        }
    }

    function getBondTokenName(
        uint256 maturity,
        uint256 solidStrikePriceE4,
        uint256 rateLBTWorthlessE4
    )
        public
        override
        pure
        returns (string memory shortName, string memory longName)
    {
        if (solidStrikePriceE4 != 0) {
            return genBondTokenName("SBT", "SBT", maturity, solidStrikePriceE4);
        } else if (rateLBTWorthlessE4 != 0) {
            return genBondTokenName("LBT", "LBT", maturity, rateLBTWorthlessE4);
        } else {
            return genBondTokenName("IMT", "Immortal Option", maturity, 0);
        }
    }
}

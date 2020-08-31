// solium-disable security/no-assign-params
pragma solidity 0.6.6;

import "./UseAuction.sol";
import "./UseAuctionBoard.sol";
import "./UseBondMaker.sol";
import "./oracle/UseOracle.sol";
import "./bondToken/BondTokenInterface.sol";


contract SolidBondSafetyCalc is
    Time,
    UseSafeMath,
    UseOracle,
    UseBondMaker,
    UseAuction
{
    using SafeMath for uint256;
    using SafeMath for int256;

    uint256 internal immutable AUCTION_SPAN;

    constructor(
        address oracleAddress,
        address bmAddress,
        address auctionAddress,
        uint256 auctionSpan
    )
        public
        UseOracle(oracleAddress)
        UseBondMaker(bmAddress)
        UseAuction(auctionAddress)
    {
        AUCTION_SPAN = auctionSpan;
    }

    /**
     * @notice this function is copy from SolidBondSafety.sol
     */
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

    /**
     * @notice return values are added to the same function in SolidBondSafety.sol
     */

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
    )
        public
        pure
        returns (
            bool isDanger,
            int256 cE8,
            int256 rE28
        )
    {
        uint256 vE8 = volatility;
        if (vE8 > 2 * 10**8) {
            vE8 = 2 * 10**8; // The volatility is too high.
        }
        uint256 vvtE16 = vE8.mul(vE8).mul(untilMaturity);

        uint256 xxE8 = vvtE16 / (64 * 10**6 * 86400 * 365); // 1.25^2 / 10^8 = 1 / (64 * 10^6)
        (int256 aaE4, int256 bE4) = getEmergencyBorderInfo(xxE8);
        int256 sE8 = rateETH2USD.toInt256();
        int256 kE4 = solidBondStrikePrice.toInt256();
        cE8 = sE8.sub(bE4.mul(kE4));
        // int256 lE28 = cE8.mul(cE8).mul(20183040 * 10**12);
        rE28 = int256(vvtE16).mul(aaE4).mul(kE4).mul(kE4);
        isDanger = cE8 <= 0 || cE8.mul(cE8).mul(20183040 * 10**12) <= rE28;
    }

    /**
     * @notice return values are added to the same function in SolidBondSafety.sol
     */

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
    )
        public
        pure
        returns (
            bool isDanger,
            int256 cE8,
            int256 rE28
        )
    {
        uint256 vvtE16 = volatility.mul(volatility).mul(untilMaturity);

        uint256 xxE8 = vvtE16 / (64 * 10**6 * 86400 * 365); // 1.25^2 / 10^8 = 1 / (64 * 10^6)
        (int256 aaE4, int256 bE4) = getEmergencyBorderInfo(xxE8);

        int256 sE8 = rateETH2USD.toInt256();
        int256 kE4 = solidBondStrikePrice.toInt256();
        cE8 = sE8.mul(2).sub(bE4.mul(kE4).mul(3));
        // int256 lE28 = cE8.mul(cE8).mul(20183040 * 10**12);
        rE28 = int256(vvtE16).mul(aaE4).mul(kE4).mul(kE4).mul(9);
        isDanger = cE8 <= 0 || cE8.mul(cE8).mul(20183040 * 10**12) <= rE28;
    }

    /**
     * @notice this function is combination of isDangerSolidBond and isAcceptableSBT(StableCoin.sol)
     * The specialized to get flag as a view function.
     */

    function isAcceptableSBT(
        bytes32 bondID,
        uint256 rateETH2USDE8,
        uint256 volatilityE8
    ) public view returns (bool) {
        (, uint256 maturity, uint64 solidStrikePriceE4, ) = _bondMakerContract
            .getBond(bondID);

        uint256 untilMaturity = maturity.sub(_getBlockTimestampSec());
        if (solidStrikePriceE4 == 0) {
            return false;
        }
        if (untilMaturity <= AUCTION_SPAN) {
            return false;
        }
        if (solidStrikePriceE4 % (10**5) != 0) {
            return false;
        }

        bytes32 auctionID = _auctionContract.getCurrentAuctionID(bondID);
        if (_auctionContract.ongoingAuctionSBTTotal(auctionID) != 0) {
            return false;
        }
        if (volatilityE8 > 2 * 10**8) {
            volatilityE8 = 2 * 10**8; // The volatility is too high.
        }

        if (untilMaturity >= 12 weeks) {
            return false; // The period until maturity is too long.
        }

        (bool isDanger, , ) = isDangerSolidBond(
            rateETH2USDE8,
            solidStrikePriceE4,
            volatilityE8,
            untilMaturity
        );

        return !isDanger;
    }

    function isAcceptableSBTCheck(bytes32 bondID) external returns (bool) {
        (uint256 rateETH2USDE8, uint256 volatilityE8) = _getOracleData();
        return isAcceptableSBT(bondID, rateETH2USDE8, volatilityE8);
    }
}


contract Helper is UseAuctionBoard, SolidBondSafetyCalc {
    using SafeMath for uint256;

    constructor(
        address oracleAddress,
        address bmAddress,
        address auctionAddress,
        address abAddress,
        uint256 auctionSpan
    )
        public
        SolidBondSafetyCalc(
            oracleAddress,
            bmAddress,
            auctionAddress,
            auctionSpan
        )
        UseAuctionBoard(abAddress)
    {}

    /**
     * @dev this is just a function that decrease the counts of pushing a metamask button
     * to execute revealBids() in AuctionBoard.sol
     */

    function revealBidsThree(
        bytes32 auctionID,
        uint64[] memory bids1,
        uint64 random1,
        uint64[] memory bids2,
        uint64 random2,
        uint64[] memory bids3,
        uint64 random3
    ) public {
        if (random1 != 0 && bids1.length > 0) {
            _auctionBoardContract.revealBids(auctionID, bids1, random1);
        }
        if (random2 != 0 && bids2.length > 0) {
            _auctionBoardContract.revealBids(auctionID, bids2, random2);
        }
        if (random3 != 0 && bids3.length > 0) {
            _auctionBoardContract.revealBids(auctionID, bids3, random3);
        }
    }

    /**
     * @dev this function is just enabling auction holders to execute sortBidPrice and makeEndInfo at once.
     */

    function manageOperationInReceivingPeriod(
        bytes32 auctionID,
        uint64[] memory sortedPrice
    ) public {
        _auctionBoardContract.sortBidPrice(auctionID, sortedPrice);
        _auctionBoardContract.makeEndInfo(auctionID);
    }
}

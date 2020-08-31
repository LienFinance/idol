pragma solidity 0.6.6;

import "./math/UseSafeMath.sol";
import "./StableCoinInterface.sol";
import "./util/Time.sol";
import "../node_modules/@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../node_modules/@openzeppelin/contracts/math/Math.sol";
import "./solidBondSafety/SolidBondSafety.sol";
import "./UseAuctionLater.sol";
import "./UseBondMaker.sol";
import "./oracle/UseOracle.sol";
import "./bondToken/BondTokenInterface.sol";


contract StableCoin is
    UseSafeMath,
    StableCoinInterface,
    Time,
    ERC20("iDOL", "iDOL"),
    SolidBondSafety,
    UseOracle,
    UseBondMaker,
    UseAuctionLater
{
    using Math for uint256;

    /**
     * @dev pool:mint = 1:9
     */
    uint256 internal constant LOCK_POOL_BORDER = 1;
    uint256 internal constant MINT_IDOL_BORDER = 10 - LOCK_POOL_BORDER;
    uint256 internal immutable AUCTION_SPAN;
    uint256 internal immutable EMERGENCY_AUCTION_SPAN;
    uint256 internal immutable MINT_IDOL_AMOUNT_BORDER;

    /**
     * @dev The contents of this internal storage variable can be seen by solidValueTotal function.
     */
    uint256 internal _solidValueTotalE12;

    mapping(bytes32 => uint64) public auctionTriggerCount;

    /**
     * @dev Record the pooled IDOL for each person(= beta * minted amount).
     * The pooled IDOL is going to be refunded partially to the person when the deposited SBT is
     * sold in the auction.
     */
    struct LockedPool {
        uint64 IDOLAmount;
        uint64 baseSBTAmount;
    }
    mapping(address => mapping(bytes32 => LockedPool)) public lockedPoolE8;

    /**
     * @dev The contents in this internal storage variable can be seen by getPoolInfo function.
     * @param lockedSolidBondTotalE8 is the current locked SBT amount.
     * @param unlockedSolidBondTotalE8 is the SBT amount unlocked by unlockSBT().
     * @param lockedPoolIDOLTotalE8 is the iDOL amount locked to the pool for the SBT.
     * @param SBT2BurnedIDOLTotalE8 is the iDOL amount burned by unlockSBT() or setSettledAverageAuctionPrice().
     */
    struct AccountingTotalInfo {
        uint64 lockedSolidBondTotalE8;
        uint64 unlockedSolidBondTotalE8;
        uint64 lockedPoolIDOLTotalE8;
        uint64 SBT2BurnedIDOLTotalE8;
    }
    mapping(bytes32 => AccountingTotalInfo) internal _accountingTotalInfo;

    /**
     * @notice Record the average settlement price for each SBT bondID.
     * @dev The average settlement price is used for calculating the amount to return partially from
     * the pooled IDOL.
     * The contents in this internal storage variable can be seen by getPoolInfo function.
     * @param auctionSoldSolidBondTotal is the SBT total amount already sold in the auction.
     * @param auctionPaidIDOLTotalE8 is the iDOL amount already paid for the SBT in the auction.
     * @param settledAverageAuctionPrice is the average price for the SBT in the auction and unlockSBT().
     * @param isAllAmountSoldInAuction indicates whether auctionSoldSolidBondTotal equals to the auction amount or not.
     */
    struct AuctionAmountInfo {
        uint64 auctionSoldSolidBondTotal;
        uint64 auctionPaidIDOLTotalE8;
        uint64 settledAverageAuctionPrice;
        bool isAllAmountSoldInAuction;
    }
    mapping(bytes32 => AuctionAmountInfo) internal _auctionAmountInfo;

    constructor(
        address oracleAddress,
        address bondMakerAddress,
        uint256 auctionSpan,
        uint256 emergencyAuctionSpan,
        uint256 mintIDOLAmountBorder
    ) public UseOracle(oracleAddress) UseBondMaker(bondMakerAddress) {
        _setupDecimals(8);
        AUCTION_SPAN = auctionSpan;
        EMERGENCY_AUCTION_SPAN = emergencyAuctionSpan;
        MINT_IDOL_AMOUNT_BORDER = mintIDOLAmountBorder;
    }

    function _reduceSBTValue(uint256 SBTValueE12) internal {
        _solidValueTotalE12 = _solidValueTotalE12.sub(SBTValueE12);
    }

    /**
     * @notice In order to calculate the amount to burn from the pooled IDOL, need to aggregate
     * IDOLs both in the auction and in the unlockSBT function. Calculate settled-average-auction-
     * price (every time an auction ends, the auction contract trigger this)
     * @param bondID ID for auctioned SBT
     * @param auctionPaidIDOL IDOL amount burned in this auction
     * @param auctionSoldAmount SBT amount sold in this auction
     * @param isLastTime True when the auction successfully sold all the SBT
     */
    function _setSettledAverageAuctionPrice(
        bytes32 bondID,
        uint64 auctionPaidIDOL,
        uint64 auctionSoldAmount,
        bool isLastTime
    ) internal {
        bytes32 poolID = getCurrentPoolID(bondID);
        AuctionAmountInfo memory auctionInfo = _auctionAmountInfo[poolID];

        auctionInfo.auctionSoldSolidBondTotal = auctionInfo
            .auctionSoldSolidBondTotal
            .add(auctionSoldAmount)
            .toUint64();
        auctionInfo.auctionPaidIDOLTotalE8 = auctionInfo
            .auctionPaidIDOLTotalE8
            .add(auctionPaidIDOL)
            .toUint64();

        if (isLastTime) {
            // Calculate the amount of IDOL to burn


                AccountingTotalInfo memory accountingInfo
             = _accountingTotalInfo[poolID];
            uint256 burnIDOLAmount = 0;

            /**
             * @dev In the case of beta=0.1, total distributed IDOL for the bondID
             * can be calculated by the pooled IDOL amount for the bondID multiplied by 9
             * (= MINT_IDOL_BORDER).
             * In the case that someone has withdrawn SBT by unlockSBT(), the pooled IDOL is also
             * circulated.
             * When 3 SBT (strike = $100) are withdrawn by unlockSBT() and 8 SBT are sold in the
             * auction, circulated = (3+8)*100*0.9 and everminted = (3+8)*100.
             * Those 3 and 8 can be captured by looking at the amount of IDOL in the pool.
             */
            {
                // (circulated amount) = (locked pool iDOL total) * MINT_IDOL_BORDER / LOCK_POOL_BORDER
                //                     = (locked pool iDOL total) * MINT_IDOL_BORDER
                uint256 circulated = accountingInfo.lockedPoolIDOLTotalE8.mul(
                    MINT_IDOL_BORDER
                );
                uint256 everMinted = accountingInfo.lockedPoolIDOLTotalE8.add(
                    circulated
                );
                uint256 allBurn = accountingInfo.SBT2BurnedIDOLTotalE8.add(
                    auctionInfo.auctionPaidIDOLTotalE8
                );
                if (allBurn > circulated) {
                    if (everMinted >= allBurn) {
                        // burn all the IDOL issued for the SBT put up in the auction
                        //SAME MEANING of: burnIDOLAmount = everMinted.sub(allBurn).add(auctionPaidIDOLTotalE8[bondID]);
                        burnIDOLAmount = everMinted.sub(
                            accountingInfo.SBT2BurnedIDOLTotalE8
                        );
                    } else {
                        // burn all the IDOL issued for the SBT put up in the auction, and excess amount.
                        //SAME MEANING of: burnIDOLAmount = allBurn.sub(allBurn).add(auctionPaidIDOLTotalE8[bondID]);
                        burnIDOLAmount = allBurn.sub(
                            accountingInfo.SBT2BurnedIDOLTotalE8
                        );
                    }
                } else {
                    // burn as much as we can.
                    //In this case, burn rate(price) is lower than 1-beta
                    burnIDOLAmount = accountingInfo.lockedPoolIDOLTotalE8.add(
                        auctionInfo.auctionPaidIDOLTotalE8
                    );
                }
            }

            (, , uint64 solidBondStrikePriceUSD, ) = _bondMakerContract.getBond(
                bondID
            );

            _burn(address(this), burnIDOLAmount);
            accountingInfo.SBT2BurnedIDOLTotalE8 = accountingInfo
                .SBT2BurnedIDOLTotalE8
                .add(auctionInfo.auctionPaidIDOLTotalE8)
                .toUint64();

            _reduceSBTValue(
                auctionInfo.auctionSoldSolidBondTotal.mul(
                    solidBondStrikePriceUSD
                )
            );
            accountingInfo.unlockedSolidBondTotalE8 = accountingInfo
                .unlockedSolidBondTotalE8
                .add(auctionInfo.auctionSoldSolidBondTotal)
                .toUint64();

            auctionInfo.settledAverageAuctionPrice = accountingInfo
                .SBT2BurnedIDOLTotalE8
                .mul(10**8)
                .div(
                accountingInfo
                    .unlockedSolidBondTotalE8,
                "system: the total unlock amount should be non-zero value"
            )
                .toUint64();

            auctionInfo.isAllAmountSoldInAuction = true;
            auctionTriggerCount[bondID] = auctionTriggerCount[bondID]
                .add(1)
                .toUint64();

            _accountingTotalInfo[poolID] = accountingInfo;

            uint256 totalIDOLSupply = totalSupply();
            emit LogLambda(
                poolID,
                auctionInfo.settledAverageAuctionPrice,
                totalIDOLSupply,
                _solidValueTotalE12
            );
        }
        _auctionAmountInfo[poolID] = auctionInfo;
    }

    /**
     * @param poolID is a pool ID.
     * @return lockedSBTTotal is the current locked SBT amount. (e8)
     * @return unlockedSBTTotal is the SBT amount unlocked with unlockSBT(). (e8)
     * @return lockedPoolIDOLTotal is the iDOL amount locked to the pool when this was minted. (e8)
     * @return burnedIDOLTotal is the iDOL amount burned with unlockSBT() and setSettledAverageAuctionPrice(). (e8)
     * @return soldSBTTotalInAuction is the SBT total amount already sold in the auction. (e8)
     * @return paidIDOLTotalInAuction is the iDOL amount already paid for SBT in the auction. (e8)
     * @return settledAverageAuctionPrice is the average price with iDOL of the SBT in the auction and unlockSBT(). (e8)
     * @return isAllAmountSoldInAuction is whether auctionSoldSolidBondTotal is equal to the auction amount or not.
     */
    function getPoolInfo(bytes32 poolID)
        external
        override
        view
        returns (
            uint64 lockedSBTTotal,
            uint64 unlockedSBTTotal,
            uint64 lockedPoolIDOLTotal,
            uint64 burnedIDOLTotal,
            uint64 soldSBTTotalInAuction,
            uint64 paidIDOLTotalInAuction,
            uint64 settledAverageAuctionPrice,
            bool isAllAmountSoldInAuction
        )
    {

            AccountingTotalInfo memory accountingInfo
         = _accountingTotalInfo[poolID];
        lockedSBTTotal = accountingInfo.lockedSolidBondTotalE8;
        unlockedSBTTotal = accountingInfo.unlockedSolidBondTotalE8;
        lockedPoolIDOLTotal = accountingInfo.lockedPoolIDOLTotalE8;
        burnedIDOLTotal = accountingInfo.SBT2BurnedIDOLTotalE8;


            AuctionAmountInfo memory auctionSettlementInfo
         = _auctionAmountInfo[poolID];
        soldSBTTotalInAuction = auctionSettlementInfo.auctionSoldSolidBondTotal;
        paidIDOLTotalInAuction = auctionSettlementInfo.auctionPaidIDOLTotalE8;
        settledAverageAuctionPrice = auctionSettlementInfo
            .settledAverageAuctionPrice;
        isAllAmountSoldInAuction = auctionSettlementInfo
            .isAllAmountSoldInAuction;
    }

    function solidValueTotal() external override view returns (uint256) {
        return _solidValueTotalE12;
    }

    function generatePoolID(bytes32 bondID, uint64 count)
        public
        override
        pure
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(bondID, count, "lien"));
    }

    function getCurrentPoolID(bytes32 bondID)
        public
        override
        view
        returns (bytes32)
    {
        uint64 currentTriggeredCount = auctionTriggerCount[bondID];
        return generatePoolID(bondID, currentTriggeredCount);
    }

    function getLockedPool(address user, bytes32 poolID)
        public
        override
        view
        returns (uint64, uint64)
    {
        return (
            lockedPoolE8[user][poolID].IDOLAmount,
            lockedPoolE8[user][poolID].baseSBTAmount
        );
    }

    /**
     * @dev poolID is counted up and used when the SBT once released from IDOL in the emergency
     * auction becomes qualified again before its maturity.
     */

    /**
     * @dev Check if the SBT is qualified in terms of the length of the time until maturity,
     * the volatility, and the distance between the current price and the strike price.
     */
    function isAcceptableSBT(bytes32 bondID)
        public
        virtual
        override
        isNotEmptyAuctionInstance
        returns (bool)
    {
        (
            address bondTokenAddress,
            uint256 maturity,
            uint64 solidStrikePriceE4,

        ) = _bondMakerContract.getBond(bondID);
        require(bondTokenAddress != address(0), "the bond is not registered");
        require(
            solidStrikePriceE4 != 0,
            "the bond does not match to the form of SBT"
        );
        require(
            maturity > _getBlockTimestampSec() + AUCTION_SPAN,
            "a request to hold an auction of the bond has already expired"
        );
        require(
            solidStrikePriceE4 % (10**5) == 0,
            "the strike price need to be $ 10*X"
        );

        bytes32 auctionID = _auctionContract.getCurrentAuctionID(bondID);
        require(
            _auctionContract.ongoingAuctionSBTTotal(auctionID) == 0,
            "this SBT is on a auciton"
        );

        (uint256 rateETH2USDE8, uint256 volatilityE8) = _getOracleData();
        bool isDanger = isDangerSolidBond(
            rateETH2USDE8,
            solidStrikePriceE4,
            volatilityE8,
            maturity - _getBlockTimestampSec()
        );

        emit LogIsAcceptableSBT(bondID, !isDanger);

        return !isDanger;
    }

    /**
     * @notice Lock SBT and mint IDOL
     * @param bondID the ID for the SBT locked for minting IDOL
     * @param lockAmountE8 the amount of locked SBT
     */
    function mint(
        bytes32 bondID,
        address recipient,
        uint64 lockAmountE8
    )
        public
        override
        returns (
            bytes32 poolID,
            uint64 obtainIDOLAmountE8,
            uint64 poolIDOLAmountE8
        )
    {
        poolID = getCurrentPoolID(bondID);

        // Check if the maturity is sufficiently distant from the current time.
        (
            address bondTokenAddress,
            ,
            uint256 solidStrikePriceE4,

        ) = _bondMakerContract.getBond(bondID);
        require(
            isAcceptableSBT(bondID),
            "SBT with the bondID is not currently acceptable"
        );


            AccountingTotalInfo memory accountingInfo
         = _accountingTotalInfo[poolID];

        // Calculate the mint amount based on the dilution ratio.
        uint256 solidBondValueE12 = lockAmountE8.mul(solidStrikePriceE4);
        uint256 mintAmountE8 = calcSBT2IDOL(solidBondValueE12);
        require(
            accountingInfo.lockedPoolIDOLTotalE8 != 0 ||
                mintAmountE8 >= MINT_IDOL_AMOUNT_BORDER,
            "mint amount need to be greater than 500 idol for this bond"
        );

        ERC20 bondTokenContract = ERC20(bondTokenAddress);
        bondTokenContract.transferFrom(msg.sender, address(this), lockAmountE8);

        // (pooling amount) = mintAmountE8 * LOCK_POOL_BORDER / 10 = mintAmountE8 / 10
        uint256 poolAmount = mintAmountE8.div(10);
        LockedPool storage lockedPoolInfo = lockedPoolE8[recipient][poolID];
        lockedPoolInfo.IDOLAmount = lockedPoolInfo
            .IDOLAmount
            .add(poolAmount)
            .toUint64();
        lockedPoolInfo.baseSBTAmount = lockedPoolInfo
            .baseSBTAmount
            .add(lockAmountE8)
            .toUint64();

        _mint(recipient, mintAmountE8.sub(poolAmount));
        _mint(address(this), poolAmount);
        _solidValueTotalE12 = _solidValueTotalE12.add(solidBondValueE12);
        accountingInfo.lockedSolidBondTotalE8 = accountingInfo
            .lockedSolidBondTotalE8
            .add(lockAmountE8)
            .toUint64();
        accountingInfo.lockedPoolIDOLTotalE8 = accountingInfo
            .lockedPoolIDOLTotalE8
            .add(poolAmount)
            .toUint64();
        _accountingTotalInfo[poolID] = accountingInfo;

        uint256 obtainAmount = mintAmountE8.sub(poolAmount);
        emit LogMintIDOL(bondID, recipient, poolID, obtainAmount, poolAmount);
        return (poolID, obtainAmount.toUint64(), poolAmount.toUint64());
    }

    /**
     * @dev Only the auction contract address can burn some specified amount of the IDOL held by
     * an account.
     */
    function burnFrom(address account, uint256 amount)
        public
        override
        isNotEmptyAuctionInstance
    {
        require(
            msg.sender == address(_auctionContract),
            "msg.sender must be auction contract"
        );
        _burn(account, amount);
    }

    /**
     * @notice This function provides the opportunity to redeem any type of SBT with a correct
     * amount by burning iDOL. iDOL is pegged to totalLockedValue/totalSupply dollar
     * (initially 1 dollar), so we can always allow anyone to redeem at most 1 dollar worth SBT
     * by burning 1 dollar worth iDOL.
     * This is based on the mathematical fact that the theoretical value of 1 unit SBT with
     * strike price 100 dollar is always strictly less than 100 dollar (e.g. 99.99 dollar).
     * @dev IDOL contract needs to know the value of iDOL per unit by calculating
     * totalLockedValue/totalSupply the value of iDOL per unit may change when the auction
     * settlement price is not within the certain price range.
     * rewardSBT = burnAmountE8/solidStrikePriceE4 * totalSupply/totalLockedValue
     * @param bondID is the bond to unlock
     * @param burnAmountE8 is the iDOL amount to burn
     */
    function unlockSBT(bytes32 bondID, uint64 burnAmountE8)
        public
        override
        returns (uint64)
    {
        bytes32 poolID = getCurrentPoolID(bondID);
        (
            address bondTokenAddress,
            ,
            uint256 solidStrikePriceE4,

        ) = _bondMakerContract.getBond(bondID);
        require(bondTokenAddress != address(0), "the bond is not registered");
        require(solidStrikePriceE4 != 0, "the bond is not the form of SBT");


            AccountingTotalInfo memory accountingInfo
         = _accountingTotalInfo[poolID];

        uint64 rewardSBTE8 = burnAmountE8
            .mul(_solidValueTotalE12)
            .div(totalSupply(), "system error: totalSupply never becomes zero")
            .div(
            solidStrikePriceE4,
            "system error: solidStrikePrice never becomes zero [unlockSBT]"
        )
            .toUint64();

        // Burn iDOL.
        accountingInfo.SBT2BurnedIDOLTotalE8 = accountingInfo
            .SBT2BurnedIDOLTotalE8
            .add(burnAmountE8)
            .toUint64();

        _burn(msg.sender, burnAmountE8);

        // Return SBT.
        BondTokenInterface bondTokenContract = BondTokenInterface(
            payable(bondTokenAddress)
        );
        bondTokenContract.transfer(msg.sender, rewardSBTE8);

        emit LogBurnIDOL(bondID, msg.sender, burnAmountE8, rewardSBTE8);

        // Update solidValueTotal, lockedSolidBondTotalE18 and unlockedSolidBondTotal.
        _solidValueTotalE12 = _solidValueTotalE12.sub(
            rewardSBTE8.mul(solidStrikePriceE4)
        );
        accountingInfo.lockedSolidBondTotalE8 = accountingInfo
            .lockedSolidBondTotalE8
            .sub(rewardSBTE8)
            .toUint64();
        accountingInfo.unlockedSolidBondTotalE8 = accountingInfo
            .unlockedSolidBondTotalE8
            .add(rewardSBTE8)
            .toUint64();

        _accountingTotalInfo[poolID] = accountingInfo;

        return rewardSBTE8;
    }

    /**
     * @notice Starts regular auction for SBT with short maturity.
     */
    function startAuctionOnMaturity(bytes32 bondID)
        public
        override
        isNotEmptyAuctionInstance
    {
        bytes32 poolID = getCurrentPoolID(bondID);
        (
            address bondTokenAddress,
            uint256 maturity,
            uint64 solidBondStrikePriceUSD,

        ) = _bondMakerContract.getBond(bondID);
        require(bondTokenAddress != address(0), "the bond is not registered");
        require(
            solidBondStrikePriceUSD != 0,
            "the bond is not the form of SBT"
        );
        require(
            maturity <= _getBlockTimestampSec() + AUCTION_SPAN,
            "maturity is later than the regular auctionSpan"
        );

        uint64 lockedSolidBondTotalE8;
        {

                AccountingTotalInfo memory accountingInfo
             = _accountingTotalInfo[poolID];
            lockedSolidBondTotalE8 = accountingInfo.lockedSolidBondTotalE8;
            if (lockedSolidBondTotalE8 == 0) {
                if (accountingInfo.lockedPoolIDOLTotalE8 != 0) {
                    _setSettledAverageAuctionPrice(bondID, 0, 0, true);
                }
                return;
            }
            delete _accountingTotalInfo[poolID].lockedSolidBondTotalE8;
        }

        if (maturity <= _getBlockTimestampSec() + EMERGENCY_AUCTION_SPAN) {
            _auctionContract.startAuction(bondID, lockedSolidBondTotalE8, true);
        } else {
            _auctionContract.startAuction(
                bondID,
                lockedSolidBondTotalE8,
                false
            );
        }

        // Send SBT to the auction contract.
        BondTokenInterface bondTokenContract = BondTokenInterface(
            payable(bondTokenAddress)
        );
        bondTokenContract.transfer(
            address(_auctionContract),
            lockedSolidBondTotalE8
        );
    }

    /**
     * @notice Starts emergency auction
     * @dev Check if the SBT needs to trigger the emergency auction based on the length of the
     * time until maturity, the volatility, and the distance between the current price and the
     * strike price.
     */
    function startAuctionByMarket(bytes32 bondID)
        public
        override
        isNotEmptyAuctionInstance
    {
        bytes32 poolID = getCurrentPoolID(bondID);
        (
            address bondTokenAddress,
            uint256 maturity,
            uint64 solidBondStrikePriceUSD,

        ) = _bondMakerContract.getBond(bondID);
        require(bondTokenAddress != address(0), "the bond is not registered");
        require(
            solidBondStrikePriceUSD != 0,
            "the bond is not the form of SBT"
        );

        (uint256 rateETH2USD, uint256 volatility) = _getOracleData();
        bool isDanger = isInEmergency(
            rateETH2USD,
            solidBondStrikePriceUSD,
            volatility,
            maturity - _getBlockTimestampSec()
        );
        require(isDanger, "the SBT is not in emergency");

        uint64 lockedSolidBondTotalE8;
        {

                AccountingTotalInfo memory accountingInfo
             = _accountingTotalInfo[poolID];
            lockedSolidBondTotalE8 = accountingInfo.lockedSolidBondTotalE8;
            if (lockedSolidBondTotalE8 == 0) {
                if (accountingInfo.lockedPoolIDOLTotalE8 != 0) {
                    _setSettledAverageAuctionPrice(bondID, 0, 0, true);
                }
                return;
            }
            delete _accountingTotalInfo[poolID].lockedSolidBondTotalE8;
        }

        _auctionContract.startAuction(bondID, lockedSolidBondTotalE8, true);

        // Send SBT to the auction contract.
        BondTokenInterface bondTokenContract = BondTokenInterface(
            payable(bondTokenAddress)
        );
        bondTokenContract.transfer(
            address(_auctionContract),
            lockedSolidBondTotalE8
        );
    }

    /**
     * @notice Sets SettledAverageAuctionPrice and burns a portion of pooled IDOL.
     * @dev Only callable from the auction contract.
     */
    function setSettledAverageAuctionPrice(
        bytes32 bondID,
        uint64 totalPaidIDOL,
        uint64 SBTAmount,
        bool isLast
    ) public override isNotEmptyAuctionInstance {
        require(
            msg.sender == address(_auctionContract),
            "msg.sender must be auction contract"
        );

        (, , uint256 solidStrikePrice, ) = _bondMakerContract.getBond(bondID);
        require(solidStrikePrice != 0, "the bond is not the form of SBT");
        _setSettledAverageAuctionPrice(
            bondID,
            totalPaidIDOL,
            SBTAmount,
            isLast
        );
    }

    /**
     * @dev Returns the IDOL amount equivalent to the strike price value of SBT.
     * @param solidBondValueE12 solidBondValueE12(USD) = SBT(SBT) * strikePrice(USD/SBT)
     */
    function calcSBT2IDOL(uint256 solidBondValueE12)
        public
        override
        view
        returns (uint256 IDOLAmountE8)
    {
        if (_solidValueTotalE12 == 0) {
            return solidBondValueE12.div(10**4);
        }

        return solidBondValueE12.mul(totalSupply()).div(_solidValueTotalE12);
    }

    function _calcUnlockablePoolAmount(bytes32 poolID, address account)
        internal
        returns (uint64)
    {
        AuctionAmountInfo memory auctionInfo = _auctionAmountInfo[poolID];
        if (!auctionInfo.isAllAmountSoldInAuction) {
            return 0;
        }

        uint256 pool = lockedPoolE8[account][poolID].IDOLAmount;
        uint256 amountE8 = lockedPoolE8[account][poolID].baseSBTAmount;
        delete lockedPoolE8[account][poolID];

        uint256 auctionIDOLPriceE8 = auctionInfo.settledAverageAuctionPrice;
        uint256 toBack = 0;

        // The return value can be calculated by
        // (average sold price) * (total sold amount) - (total distributed amount) for the bondID.
        // Here, (total distributed amount) = pool * MINT_IDOL_BORDER / LOCK_POOL_BORDER = pool * MINT_IDOL_BORDER
        if (
            auctionIDOLPriceE8.mul(amountE8).div(10**8) >
            pool.mul(MINT_IDOL_BORDER)
        ) {
            toBack =
                auctionIDOLPriceE8.mul(amountE8).div(10**8) -
                pool.mul(MINT_IDOL_BORDER);
        }

        return toBack.min(pool).toUint64();
    }

    /**
     * @notice Receives all the redeemable IDOL in one action.
     * @dev Receive corresponding pooled IDOL based on the SettledAverageAuctionPrice.
     */
    function returnLockedPoolTo(bytes32[] memory poolIDs, address account)
        public
        override
        returns (uint64)
    {
        uint256 totalBackIDOLAmount = 0;
        for (uint256 i = 0; i < poolIDs.length; i++) {
            // For each bondID, the return amount should not exceed the pooled amount.
            uint64 backIDOLAmount = _calcUnlockablePoolAmount(
                poolIDs[i],
                account
            );
            totalBackIDOLAmount = totalBackIDOLAmount.add(backIDOLAmount);
            if (backIDOLAmount != 0) {
                emit LogReturnLockedPool(poolIDs[i], account, backIDOLAmount);
            }
        }

        this.transfer(account, totalBackIDOLAmount);

        return totalBackIDOLAmount.toUint64();
    }

    function returnLockedPool(bytes32[] memory poolIDs)
        public
        override
        returns (uint64)
    {
        return returnLockedPoolTo(poolIDs, msg.sender);
    }
}

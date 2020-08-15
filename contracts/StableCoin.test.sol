pragma solidity 0.6.6;

import "./StableCoin.sol";


contract TestStableCoin is StableCoin {
    constructor(
        address oracleAddress,
        address bondMakerAddress,
        uint256 auctionSpan,
        uint256 emergencyAuctionSpan
    )
        public
        StableCoin(
            oracleAddress,
            bondMakerAddress,
            auctionSpan,
            emergencyAuctionSpan
        )
    {}

    function testMint(
        bytes32 bondID,
        address recipient,
        uint64 lockAmount
    ) public {
        (
            address bondTokenAddress,
            ,
            uint64 solidStrikePrice,

        ) = _bondMakerContract.getBond(bondID);

        uint256 solidBondValue = lockAmount.mul(solidStrikePrice);
        uint256 mintAmount = calcSBT2IDOL(solidBondValue).toUint64();

        ERC20 bondToken = ERC20(bondTokenAddress);
        bondToken.transferFrom(msg.sender, address(this), lockAmount);

        // mint
        uint256 poolAmount = mintAmount.toUint64().mul(LOCK_POOL_BORDER).div(
            10
        );
        LockedPool storage lockedPoolInfo = lockedPoolE8[recipient][bondID];
        lockedPoolInfo.IDOLAmount = lockedPoolInfo
            .IDOLAmount
            .add(poolAmount)
            .toUint64();
        _mint(
            recipient,
            mintAmount
                .sub(
                poolAmount,
                "system error: LOCK_POOL_BORDER should be less than or equal to 10"
            )
                .toUint64()
        );
        _mint(address(this), poolAmount);
        _solidValueTotalE12 = _solidValueTotalE12.add(solidBondValue);
        _accountingTotalInfo[bondID]
            .lockedSolidBondTotalE8 = _accountingTotalInfo[bondID]
            .lockedSolidBondTotalE8
            .add(lockAmount)
            .toUint64();
    }

    function mint2(address minter, uint64 amount) public {
        _mint(minter, amount);
    }

    function mint3(bytes32 bondID, uint64 lockAmount) public {
        uint64 strikePrice = 200;
        uint256 solidBondValue = lockAmount.mul(strikePrice);
        uint256 mintAmount = calcSBT2IDOL(solidBondValue);

        // mint
        uint64 poolAmount = mintAmount
            .toUint64()
            .mul(LOCK_POOL_BORDER)
            .div(10)
            .toUint64();
        LockedPool storage lockedPoolInfo = lockedPoolE8[msg.sender][bondID];
        lockedPoolInfo.IDOLAmount = lockedPoolInfo
            .IDOLAmount
            .add(poolAmount)
            .toUint64();
        lockedPoolInfo.baseSBTAmount = lockedPoolInfo
            .baseSBTAmount
            .add(lockAmount)
            .toUint64();

        _mint(msg.sender, mintAmount.sub(poolAmount));
        _mint(address(this), poolAmount);
        _solidValueTotalE12 = _solidValueTotalE12.add(solidBondValue);
        _accountingTotalInfo[bondID]
            .lockedSolidBondTotalE8 = _accountingTotalInfo[bondID]
            .lockedSolidBondTotalE8
            .add(lockAmount)
            .toUint64();
        _accountingTotalInfo[bondID]
            .lockedPoolIDOLTotalE8 = _accountingTotalInfo[bondID]
            .lockedPoolIDOLTotalE8
            .add(poolAmount)
            .toUint64();
    }

    function isAcceptableSBT(bytes32 bondID) public override returns (bool) {
        (, uint256 maturity, uint64 solidStrikePriceE4, ) = _bondMakerContract
            .getBond(bondID);
        require(
            solidStrikePriceE4 != 0,
            "the bond does not match to the form of SBT"
        );
        require(
            maturity > _getBlockTimestampSec() + AUCTION_SPAN,
            "a request to hold an auction of the bond has already expired"
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

    function testSetLockedPool(
        address sender,
        bytes32 bondID,
        uint64 amount
    ) public {
        lockedPoolE8[sender][bondID] = LockedPool(amount, 0);
    }

    function testSetSettledPriceAuction(bytes32 bondID, uint64 settledPrice)
        public
    {
        _auctionAmountInfo[bondID].settledAverageAuctionPrice = settledPrice;
    }

    function getSettledAveragePrice(bytes32 bondID)
        public
        view
        returns (uint64)
    {
        return _auctionAmountInfo[bondID].settledAverageAuctionPrice;
    }

    function testSetLambda(uint256 lambdaE8) public {
        if (totalSupply() == 0) {
            _mint(msg.sender, lambdaE8);
            _solidValueTotalE12 = 10**12;
        } else {
            uint256 expectedSBTValue = totalSupply().mul(10**12).div(lambdaE8);
            _solidValueTotalE12 = expectedSBTValue;
        }
    }

    // function setBondRegister(bytes32 bondID) public {
    //     _registerSolidBond(bondID);
    // }

    // function getBondRegister(bytes32 bondID) public view returns (bool) {
    //     return isRegisteredSBT[bondID];
    // }
}

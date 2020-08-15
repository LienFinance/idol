pragma solidity 0.6.6;

import "../bondToken/BondTokenInterface.sol";
import "./ERC20OracleInterface.sol";
import "./PricingInterface.sol";
import "../BondMaker.sol";
import "../oracle/UseOracle.sol";
import "../UseBondMaker.sol";
import "../math/UseSafeMath.sol";
import "../util/Time.sol";
import "./ERC20Vestable.sol";


contract DecentralizedOTC is
    UseOracle,
    UseBondMaker,
    UseSafeMath,
    Time,
    TransferETH
{
    address internal immutable LIEN_TOKEN_ADDRESS;

    constructor(
        address bondMakerAddress,
        address oracleAddress,
        address lienTokenAddress
    ) public UseOracle(oracleAddress) UseBondMaker(bondMakerAddress) {
        LIEN_TOKEN_ADDRESS = lienTokenAddress;
    }

    mapping(bytes32 => address) public deployer;

    mapping(bytes32 => bool) public LBTList;

    /**
     * @notice ERC20pool is the amount of ERC20 deposit of a deployer.
     * spread is the bid-ask spread.
     */
    struct PoolInfo {
        address ERC20Address;
        int16 spread;
        bool vestable;
        uint256 endTime;
    }
    mapping(bytes32 => PoolInfo) public poolMap;

    struct OracleInfo {
        address oracleAddress;
        address calculatorAddress;
    }
    mapping(bytes32 => OracleInfo) public oracleInfo;

    event LogLienTokenLBTSwap(
        address indexed sender,
        uint256 paidLBTAmount,
        uint256 receivedERC20Amount
    );

    event LogCreateERC20Pool(
        address indexed deployer,
        address indexed ERC20Address,
        bytes32 indexed poolID
    );

    event LogDepositERC20Pool(
        address indexed deployer,
        bytes32 indexed poolID,
        uint256 amount
    );

    event LogWithdrawERC20Pool(
        address indexed sender,
        bytes32 indexed erc20PoolID,
        uint256 amount
    );

    event LogTransferLBTValueToLien(bytes32 indexed lbtID, uint256 ETHamount);

    /**
     * @notice providers set a pool and deposit to a pool.
     * If there is vesting(lockUp) setting, users of their pool transfer LBT to grants of the vesting ERC20 contract.
     */
    function setPoolMap(
        address ERC20Address,
        int16 spread,
        bool isVestable,
        uint256 vestingEndTime
    ) public returns (bytes32 erc20PoolID) {
        erc20PoolID = keccak256(abi.encodePacked(msg.sender, ERC20Address));
        require(deployer[erc20PoolID] == address(0), "already registered");
        poolMap[erc20PoolID] = PoolInfo(
            ERC20Address,
            spread,
            isVestable,
            vestingEndTime
        );
        deployer[erc20PoolID] = msg.sender;
        emit LogCreateERC20Pool(msg.sender, ERC20Address, erc20PoolID);
    }

    /**
     * @notice providers must provide LBT price caluculator and ERC20 price oracle.
     */
    function setProvider(
        bytes32 erc20PoolID,
        address oracleAddress,
        address calculatorAddress
    ) public {
        require(
            msg.sender == deployer[erc20PoolID],
            "only deployer is allowed to execute"
        );
        oracleInfo[erc20PoolID] = OracleInfo(oracleAddress, calculatorAddress);
    }

    function getOraclePrice(bytes32 erc20PoolID) public view returns (uint256) {
        ERC20OracleInterface oracleContract = ERC20OracleInterface(
            oracleInfo[erc20PoolID].oracleAddress
        );
        return oracleContract.getPrice();
    }

    function _getEtherOraclePrice()
        internal
        virtual
        returns (uint256 etherPriceE4, uint256 volatilityE8)
    {
        uint256 etherPriceE8;
        (etherPriceE8, volatilityE8) = _getOracleData();
        etherPriceE4 = etherPriceE8.div(10**4);
    }

    /**
     * @notice Gets LBT data and market Ether data, and outputs the theoretical price of the LBT.
     */
    function getLBTTheoreticalPrice(
        bytes32 erc20PoolID,
        uint256 etherPriceE4,
        uint256 liquidStrikePriceE4,
        uint256 volatility,
        uint256 maturity
    ) public view returns (uint256) {
        require(
            _getBlockTimestampSec() < maturity && _getBlockTimestampSec() >= maturity - 12 weeks,
            "LBT should not have expired and the maturity should not be so distant"
        );
        uint256 untilMaturity = maturity.sub(_getBlockTimestampSec());
        PricingInterface pricerContract = PricingInterface(
            oracleInfo[erc20PoolID].calculatorAddress
        );
        return
            pricerContract.pricing(
                etherPriceE4.toInt256(),
                liquidStrikePriceE4.toInt256(),
                volatility.toInt256(),
                untilMaturity.toInt256()
            );
    }

    /**
     * @notice Gets LBT data, and outputs the exchange rate.
     */
    function calcRateLBT2ERC20(
        bytes32 sbtID,
        bytes32 erc20PoolID,
        uint256 maturity
    ) public returns (uint256 rateLBT2ERC20) {
        (uint256 etherPrice, uint256 volatility) = _getEtherOraclePrice();
        (uint256 lowestPrice, uint256 strikePrice) = _getLowestPrice(
            sbtID,
            etherPrice
        );
        uint256 lbtPrice = getLBTTheoreticalPrice(
            erc20PoolID,
            etherPrice,
            volatility,
            strikePrice,
            maturity
        );
        if (lowestPrice > lbtPrice) {
            lbtPrice = lowestPrice;
        }

        rateLBT2ERC20 = lbtPrice.mul(10000).div(getOraclePrice(erc20PoolID));

        return rateLBT2ERC20;
    }

    /**
     * @notice removes a decimal gap from rate.
     */
    function _applyDecimalGap(
        uint256 amount,
        ERC20 bondToken,
        ERC20 token
    ) private view returns (uint256) {
        uint256 n;
        uint256 d;

        uint8 decimalsOfBondToken = bondToken.decimals();
        uint8 decimalsOfToken = token.decimals();
        if (decimalsOfBondToken > decimalsOfToken) {
            d = decimalsOfBondToken - decimalsOfToken;
        } else if (decimalsOfBondToken < decimalsOfToken) {
            n = decimalsOfToken - decimalsOfBondToken;
        }

        // The consequent multiplication would overflow under extreme and non-blocking circumstances.
        require(n < 19 && d < 19, "decimal gap needs to be lower than 19");
        return amount.mul(10**n).div(10**d);
    }

    /**
     * @notice Before this function, approve is needed to be excuted if don't use vestable option.
     * Main function of this contract. Users exchange LBT to ERC20 tokens (like Lien Token)
     */

    function exchangeLBT2ERC20(
        uint256 bondGroupID,
        bytes32 erc20PoolID,
        uint256 LBTAmount,
        uint256 expectedAmount,
        uint256 range
    ) public {
        uint256 ERC20Amount = _exchangeLBT2ERC20(
            bondGroupID,
            erc20PoolID,
            LBTAmount
        );
        if (expectedAmount != 0) {
            require(
                ERC20Amount.mul(1000 + range).div(1000) >= expectedAmount,
                "out of price range"
            );
        }
    }

    function _exchangeLBT2ERC20(
        uint256 bondGroupID,
        bytes32 erc20PoolID,
        uint256 LBTAmount
    ) internal returns (uint256 ERC20Amount) {
        bytes32 lbtID;
        bytes32 sbtID;
        {
            (bytes32[] memory bonds, ) = _bondMakerContract.getBondGroup(
                bondGroupID
            );
            require(
                bonds.length == 2,
                "the bond group must include only 2 types of bond."
            );
            lbtID = bonds[1];
            sbtID = bonds[0];
        }

        (address contractAddress, uint256 maturity, , ) = _bondMakerContract
            .getBond(lbtID);
        ERC20 bondToken = ERC20(contractAddress);

        uint256 feeAmount = LBTAmount.mul(5).div(10000);

        bondToken.transferFrom(
            msg.sender,
            deployer[erc20PoolID],
            LBTAmount - feeAmount
        );
        bondToken.transferFrom(msg.sender, address(this), feeAmount);

        PoolInfo memory pool = poolMap[erc20PoolID];
        ERC20Vestable token = ERC20Vestable(pool.ERC20Address);
        {
            uint256 rateE4 = calcRateLBT2ERC20(sbtID, erc20PoolID, maturity);
            rateE4 = rateE4.mul(uint256(1000 + pool.spread)).div(1000);
            ERC20Amount = _applyDecimalGap(
                (LBTAmount - feeAmount).mul(rateE4),
                bondToken,
                token
            );
            ERC20Amount = ERC20Amount.div(10000);
        }

        token.transferFrom(deployer[erc20PoolID], address(this), ERC20Amount);

        uint256 endTime;
        if (pool.vestable) {
            uint256 lastGrant = token.getLastGrantID(msg.sender);
            if (lastGrant != 0) {
                (, , , , endTime) = token.getGrant(msg.sender, lastGrant);
            }
            if (endTime == pool.endTime) {
                token.depositToGrant(msg.sender, lastGrant, ERC20Amount);
            } else {
                uint256 grantID = token.createGrant(msg.sender, pool.endTime);
                token.depositToGrant(msg.sender, grantID, ERC20Amount);
            }
        } else {
            token.transfer(msg.sender, ERC20Amount);
        }

        if (LBTList[lbtID] == false) {
            LBTList[lbtID] = true;
        }

        emit LogLienTokenLBTSwap(msg.sender, LBTAmount, ERC20Amount);
    }

    /**
     * @notice this function is scam prevention. LBT price will not be lower than EtherPrice - StrikePrice.
     */
    function _getLowestPrice(bytes32 sbtID, uint256 etherPrice)
        internal
        view
        returns (uint256 lowestPrice, uint256 strikePrice)
    {
        (, , strikePrice, ) = _bondMakerContract.getBond(sbtID);
        require(strikePrice != 0, "Your LBT input is not recognized as LBT");
        if (etherPrice > strikePrice) {
            lowestPrice = etherPrice.sub(strikePrice);
        }
    }

    function transferEther2LienHolders(bytes32[] memory lbtIDList) public {
        for (uint256 i = 0; i < lbtIDList.length; i++) {
            bytes32 lbtID = lbtIDList[i];
            (address contractAddress, , , ) = _bondMakerContract.getBond(lbtID);
            BondTokenInterface lbtContract = BondTokenInterface(
                payable(contractAddress)
            );
            uint256 amount = lbtContract.burnAll();

            if (amount != 0) {
                delete LBTList[lbtID];
            }
            emit LogTransferLBTValueToLien(lbtID, amount);
        }

        _transferETH(payable(LIEN_TOKEN_ADDRESS), address(this).balance);
    }
}

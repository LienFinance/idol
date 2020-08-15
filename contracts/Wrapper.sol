// solium-disable security/no-low-level-calls

pragma solidity 0.6.6;
pragma experimental ABIEncoderV2;

import "./util/DeployerRole.sol";
import "./math/UseSafeMath.sol";
import "./oracle/UseOracle.sol";
import "./UseBondMaker.sol";
import "./UseStableCoin.sol";
import "./fairswap/LBTExchangeFactoryInterface.sol";
import "./WrapperInterface.sol";
import "../node_modules/@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./bondToken/BondTokenInterface.sol";
import "./fairswap/BoxExchangeInterface.sol";


contract Wrapper is
    DeployerRole,
    UseSafeMath,
    UseOracle,
    UseBondMaker,
    UseStableCoin,
    WrapperInterface
{
    LBTExchangeFactoryInterface internal _exchangeLBTAndIDOLFactoryContract;

    constructor(
        address oracleAddress,
        address bondMakerAddress,
        address IDOLAddress,
        address exchangeLBTAndIDOLFactoryAddress
    )
        public
        UseOracle(oracleAddress)
        UseBondMaker(bondMakerAddress)
        UseStableCoin(IDOLAddress)
    {
        _setExchangeLBTAndIDOLFactory(exchangeLBTAndIDOLFactoryAddress);
    }

    function setExchangeLBTAndIDOLFactory(address contractAddress)
        public
        onlyDeployer
    {
        require(
            address(_exchangeLBTAndIDOLFactoryContract) == address(0),
            "contract has already given"
        );
        require(
            contractAddress != address(0),
            "contract should be non-zero address"
        );
        _setExchangeLBTAndIDOLFactory(contractAddress);
    }

    function _setExchangeLBTAndIDOLFactory(address contractAddress) internal {
        _exchangeLBTAndIDOLFactoryContract = LBTExchangeFactoryInterface(
            contractAddress
        );
    }

    function exchangeLBTAndIDOLFactoryAddress() public view returns (address) {
        return address(_exchangeLBTAndIDOLFactoryContract);
    }

    function registerBondAndBondGroup(bytes[] memory fnMaps, uint256 maturity)
        public
        override
        returns (bool)
    {
        bytes32[] memory bondIDs = new bytes32[](fnMaps.length);
        for (uint256 j = 0; j < fnMaps.length; j++) {
            bytes32 bondID = _bondMakerContract.generateBondID(
                maturity,
                fnMaps[j]
            );
            (address bondAddress, , , ) = _bondMakerContract.getBond(bondID);
            if (bondAddress == address(0)) {
                (bytes32 returnedBondID, , , ) = _bondMakerContract
                    .registerNewBond(maturity, fnMaps[j]);
                require(
                    returnedBondID == bondID,
                    "system error: bondID was not generated as expected"
                );
            }
            bondIDs[j] = bondID;
        }

        uint256 bondGroupID = _bondMakerContract.registerNewBondGroup(
            bondIDs,
            maturity
        );
        emit LogRegisterBondAndBondGroup(bondGroupID, bondIDs);
    }

    /**
     * @param solidBondID is a solid bond ID
     * @param SBTAmount is solid bond token amount
     * @return poolID is a pool ID
     * @return IDOLAmount is iDOL amount obtained
     */
    function _swapSBT2IDOL(
        bytes32 solidBondID,
        address SBTAddress,
        uint256 SBTAmount
    ) internal returns (bytes32 poolID, uint256 IDOLAmount) {
        // 1. approve
        ERC20(SBTAddress).approve(address(_IDOLContract), SBTAmount);

        // 2. mint (SBT -> iDOL)
        (poolID, IDOLAmount, ) = _IDOLContract.mint(
            solidBondID,
            msg.sender,
            SBTAmount.toUint64()
        );

        emit LogIssueIDOL(solidBondID, msg.sender, poolID, IDOLAmount);
        return (poolID, IDOLAmount);
    }

    /**
     * @notice swap (LBT -> iDOL)
     * @param LBTAddress is liquid bond token contract address
     * @param LBTAmount is liquid bond amount
     * @param timeout (uniswap)
     * @param isLimit (uniswap)
     */
    function _swapLBT2IDOL(
        address LBTAddress,
        uint256 LBTAmount,
        uint256 timeout,
        bool isLimit
    ) internal {
        address _boxExchangeAddress = _exchangeLBTAndIDOLFactoryContract
            .addressToExchangeLookup(LBTAddress);
        // 1. approve
        ERC20(LBTAddress).approve(_boxExchangeAddress, LBTAmount);

        // 2. order(exchange)
        BoxExchangeInterface exchange = BoxExchangeInterface(
            _boxExchangeAddress
        );
        exchange.orderSettlementToBase(timeout, msg.sender, LBTAmount, isLimit);
    }

    /**
     * @notice swap (iDOL -> LBT)
     * @param LBTAddress is liquid bond token contract address
     * @param IDOLAmount is iDOL amount
     * @param timeout (uniswap)
     * @param isLimit (uniswap)
     */
    function _swapIDOL2LBT(
        address LBTAddress,
        uint256 IDOLAmount,
        uint256 timeout,
        bool isLimit
    ) internal {
        address _boxExchangeAddress = _exchangeLBTAndIDOLFactoryContract
            .addressToExchangeLookup(LBTAddress);

        // 1. approve
        _IDOLContract.transferFrom(msg.sender, address(this), IDOLAmount);
        _IDOLContract.approve(_boxExchangeAddress, IDOLAmount);

        // 2. order(exchange)
        BoxExchangeInterface exchange = BoxExchangeInterface(
            _boxExchangeAddress
        );
        exchange.orderBaseToSettlement(
            timeout,
            msg.sender,
            IDOLAmount,
            isLimit
        );
    }

    /**
     * @notice swap (SBT -> LBT)
     * @param solidBondID is a solid bond ID
     * @param liquidBondID is a liquid bond ID
     * @param timeout (uniswap)
     * @param isLimit (uniswap)
     */
    function swapSBT2LBT(
        bytes32 solidBondID,
        bytes32 liquidBondID,
        uint256 SBTAmount,
        uint256 timeout,
        bool isLimit
    ) public override {
        (address SBTAddress, , , ) = _bondMakerContract.getBond(solidBondID);

        // uses: SBT
        _usesERC20(SBTAddress, SBTAmount);

        // 1. SBT -> LBT(exchange)
        _swapSBT2LBT(
            solidBondID,
            SBTAddress,
            liquidBondID,
            SBTAmount,
            timeout,
            isLimit
        );
    }

    function _swapSBT2LBT(
        bytes32 solidBondID,
        address SBTAddress,
        bytes32 liquidBondID,
        uint256 SBTAmount,
        uint256 timeout,
        bool isLimit
    ) internal {
        // 1. swap SBT -> IDOL)
        (, uint256 IDOLAmount) = _swapSBT2IDOL(
            solidBondID,
            SBTAddress,
            SBTAmount
        );

        // 2. swap IDOL -> LBT(exchange)
        (address LBTAddress, , , ) = _bondMakerContract.getBond(liquidBondID);
        _swapIDOL2LBT(LBTAddress, IDOLAmount, timeout, isLimit);
    }

    /**
     * @notice find a solid bond in given bond group
     * @param bondGroupID is a bond group ID
     */
    function _findSBTAndLBTBondGroup(uint256 bondGroupID)
        internal
        view
        returns (bytes32 solidBondID, bytes32[] memory liquidBondIDs)
    {
        (bytes32[] memory bondIDs, ) = _bondMakerContract.getBondGroup(
            bondGroupID
        );
        bytes32 solidID = bytes32(0);
        bytes32[] memory liquidIDs = new bytes32[](bondIDs.length - 1);
        uint256 j = 0;
        for (uint256 i = 0; i < bondIDs.length; i++) {
            (, , uint256 solidStrikePrice, ) = _bondMakerContract.getBond(
                bondIDs[i]
            );
            if (solidStrikePrice != 0) {
                // A solid bond is found.
                solidID = bondIDs[i];
            } else {
                liquidIDs[j++] = bondIDs[i];
            }
        }
        return (solidID, liquidIDs);
    }

    function _usesERC20(address erc20Address, uint256 amount) internal {
        ERC20 erc20Contract = ERC20(erc20Address);
        erc20Contract.transferFrom(msg.sender, address(this), amount);
    }

    function _reductionERC20(address erc20Address, uint256 amount) internal {
        ERC20 erc20Contract = ERC20(erc20Address);
        erc20Contract.transfer(msg.sender, amount);
    }

    function _findBondAddressListInBondGroup(uint256 bondGroupID)
        internal
        view
        returns (address[] memory bondAddressList)
    {
        (bytes32[] memory bondIDs, ) = _bondMakerContract.getBondGroup(
            bondGroupID
        );
        address[] memory bondAddreses = new address[](bondIDs.length);
        for (uint256 i = 0; i < bondIDs.length; i++) {
            (address bondTokenAddress, , , ) = _bondMakerContract.getBond(
                bondIDs[i]
            );
            bondAddreses[i] = bondTokenAddress;
        }
        return bondAddreses;
    }

    /**
     * @notice ETH -> LBT & iDOL
     * @param bondGroupID is a bond group ID
     * @return poolID is a pool ID
     * @return IDOLAmount is iDOL amount obtained
     */
    function issueLBTAndIDOL(uint256 bondGroupID)
        public
        override
        payable
        returns (
            bytes32,
            uint256,
            uint256
        )
    {
        (
            bytes32 solidBondID,
            bytes32[] memory liquidBondIDs
        ) = _findSBTAndLBTBondGroup(bondGroupID); // find SBT & LBT
        require(
            solidBondID != bytes32(0),
            "solid bond is not found in given bond group"
        );

        // 1. ETH -> SBT & LBTs
        uint256 bondAmount = _bondMakerContract.issueNewBonds{value: msg.value}(
            bondGroupID
        );

        // 2. SBT -> IDOL
        (address SBTAddress, , , ) = _bondMakerContract.getBond(solidBondID);
        (bytes32 poolID, uint256 IDOLAmount) = _swapSBT2IDOL(
            solidBondID,
            SBTAddress,
            bondAmount
        );

        // 3. IDOL reduction.
        //_reductionERC20(address(_IDOLContract), IDOLAmount);

        // 4. LBTs reduction.
        for (uint256 i = 0; i < liquidBondIDs.length; i++) {
            (address liquidAddress, , , ) = _bondMakerContract.getBond(
                liquidBondIDs[i]
            );
            _reductionERC20(liquidAddress, bondAmount);
            LogIssueLBT(liquidBondIDs[i], msg.sender, bondAmount);
        }
        return (poolID, bondAmount, IDOLAmount);
    }

    /**
     * @notice ETH -> iDOL
     * @param bondGroupID is a bond group ID
     * @param timeout (uniswap)
     * @param isLimit (uniswap)
     */
    function issueIDOLOnly(
        uint256 bondGroupID,
        uint256 timeout,
        bool isLimit
    ) public override payable {
        // 0. uses: ETH
        (
            bytes32 solidBondID,
            bytes32[] memory liquidBondIDs
        ) = _findSBTAndLBTBondGroup(bondGroupID); // find SBT & LBT
        require(
            solidBondID != bytes32(0),
            "solid bond is not found in given bond group"
        );

        // 1. ETH -> SBT & LBTs
        uint256 bondAmount = _bondMakerContract.issueNewBonds{value: msg.value}(
            bondGroupID
        );

        // 2. SBT -> IDOL
        (address SBTAddress, , , ) = _bondMakerContract.getBond(solidBondID);
        _swapSBT2IDOL(solidBondID, SBTAddress, bondAmount);

        // 3. IDOL reduction.
        //_reductionERC20(address(_IDOLContract), IDOLAmount);

        // 4. LBTs -> IDOL(+exchange)
        for (uint256 i = 0; i < liquidBondIDs.length; i++) {
            (address liquidAddress, , , ) = _bondMakerContract.getBond(
                liquidBondIDs[i]
            );
            // LBT -> IDOL(+exchange)
            _swapLBT2IDOL(liquidAddress, bondAmount, timeout, isLimit);
        }
    }

    /**
     * @notice ETH -> LBT
     * @param bondGroupID is a bond group ID
     * @param liquidBondID is a liquid bond ID
     * @param timeout (uniswap)
     * @param isLimit (uniswap)
     */
    function issueLBTOnly(
        uint256 bondGroupID,
        bytes32 liquidBondID,
        uint256 timeout,
        bool isLimit
    ) public override payable {
        (
            bytes32 solidBondID,
            bytes32[] memory liquidBondIDs
        ) = _findSBTAndLBTBondGroup(bondGroupID); // find SBT & LBT
        require(
            solidBondID != bytes32(0),
            "solid bond is not found in given bond group"
        );

        // 1. ETH -> SBT & LBTs
        uint256 bondAmount = _bondMakerContract.issueNewBonds{value: msg.value}(
            bondGroupID
        );

        // 2. SBT -> IDOL
        (address SBTAddress, , , ) = _bondMakerContract.getBond(solidBondID);
        (, uint256 IDOLAmount) = _swapSBT2IDOL(
            solidBondID,
            SBTAddress,
            bondAmount
        );

        // 3. IDOL -> LBT(+exchange)
        (address LBTAddress, , , ) = _bondMakerContract.getBond(liquidBondID);
        _swapIDOL2LBT(LBTAddress, IDOLAmount, timeout, isLimit);

        // 4. LBTs reduction
        for (uint256 i = 0; i < liquidBondIDs.length; i++) {
            (address liquidAddress, , , ) = _bondMakerContract.getBond(
                liquidBondIDs[i]
            );
            _reductionERC20(liquidAddress, bondAmount);
            LogIssueLBT(liquidBondIDs[i], msg.sender, bondAmount);
        }
    }
}

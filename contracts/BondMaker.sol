pragma solidity 0.6.6;

import "./math/UseSafeMath.sol";
import "./BondMakerInterface.sol";
import "./util/Time.sol";
import "./util/TransferETH.sol"; // this contract has payable function
import "./bondToken/BondToken.sol";
import "./util/Polyline.sol";
import "./oracle/UseOracle.sol";
import "./UseBondTokenName.sol";


contract BondMaker is
    UseSafeMath,
    BondMakerInterface,
    Time,
    TransferETH,
    Polyline,
    UseOracle,
    UseBondTokenName
{
    uint8 internal constant DECIMALS_OF_BOND_AMOUNT = 8;

    address internal immutable LIEN_TOKEN_ADDRESS;
    uint256 internal immutable MATURITY_SCALE;

    uint256 public nextBondGroupID = 1;

    /**
     * @dev The contents in this internal storage variable can be seen by getBond function.
     */
    struct BondInfo {
        uint256 maturity;
        BondToken contractInstance;
        uint64 solidStrikePriceE4;
        bytes32 fnMapID;
    }
    mapping(bytes32 => BondInfo) internal _bonds;

    /**
     * @notice mapping fnMapID to polyline
     * @dev The contents in this internal storage variable can be seen by getFnMap function.
     */
    mapping(bytes32 => LineSegment[]) internal _registeredFnMap;

    /**
     * @dev The contents in this internal storage variable can be seen by getBondGroup function.
     */
    struct BondGroup {
        bytes32[] bondIDs;
        uint256 maturity;
    }
    mapping(uint256 => BondGroup) internal _bondGroupList;

    constructor(
        address oracleAddress,
        address lienTokenAddress,
        address bondTokenNameAddress,
        uint256 maturityScale
    ) public UseOracle(oracleAddress) UseBondTokenName(bondTokenNameAddress) {
        LIEN_TOKEN_ADDRESS = lienTokenAddress;
        require(maturityScale != 0, "MATURITY_SCALE must be positive");
        MATURITY_SCALE = maturityScale;
    }

    /**
     * @notice Create bond token contract.
     * The name of this bond token is its bond ID.
     * @dev To convert bytes32 to string, encode its bond ID at first, then convert to string.
     * The symbol of any bond token with bond ID is either SBT or LBT;
     * As SBT is a special case of bond token, any bond token which does not match to the form of
     * SBT is defined as LBT.
     */
    function registerNewBond(uint256 maturity, bytes memory fnMap)
        public
        override
        returns (
            bytes32,
            address,
            uint64,
            bytes32
        )
    {
        require(
            maturity > _getBlockTimestampSec(),
            "the maturity has already expired"
        );
        require(maturity % MATURITY_SCALE == 0, "maturity must be HH:00:00");

        bytes32 bondID = generateBondID(maturity, fnMap);

        // Check if the same form of bond is already registered.
        // Cannot detect if the bond is described in a different polyline while two are
        // mathematically equivalent.
        require(
            address(_bonds[bondID].contractInstance) == address(0),
            "already register given bond type"
        );

        // Register function mapping if necessary.
        bytes32 fnMapID = generateFnMapID(fnMap);
        if (_registeredFnMap[fnMapID].length == 0) {
            uint256[] memory polyline = decodePolyline(fnMap);
            for (uint256 i = 0; i < polyline.length; i++) {
                _registeredFnMap[fnMapID].push(unzipLineSegment(polyline[i]));
            }

            assertPolyline(_registeredFnMap[fnMapID]);
        }

        uint64 solidStrikePrice = _getSolidStrikePrice(
            _registeredFnMap[fnMapID]
        );
        uint64 rateLBTWorthless = _getRateLBTWorthless(
            _registeredFnMap[fnMapID]
        );

        (
            string memory shortName,
            string memory longName
        ) = _bondTokenNameContract.getBondTokenName(
            maturity,
            solidStrikePrice,
            rateLBTWorthless
        );

        BondToken bondTokenContract = _createNewBondToken(longName, shortName);

        // Set bond info to storage.
        _bonds[bondID] = BondInfo({
            maturity: maturity,
            contractInstance: bondTokenContract,
            solidStrikePriceE4: solidStrikePrice,
            fnMapID: fnMapID
        });

        emit LogNewBond(
            bondID,
            address(bondTokenContract),
            solidStrikePrice,
            fnMapID
        );

        return (bondID, address(bondTokenContract), solidStrikePrice, fnMapID);
    }

    function _assertBondGroup(bytes32[] memory bondIDs, uint256 maturity)
        internal
        view
    {
        /**
         * @dev Count the number of the end points on x axis. In the case of a simple SBT/LBT split,
         * 3 for SBT plus 3 for LBT equals to 6.
         * In the case of SBT with the strike price 100, (x,y) = (0,0), (100,100), (200,100) defines
         * the form of SBT on the field.
         * In the case of LBT with the strike price 100, (x,y) = (0,0), (100,0), (200,100) defines
         * the form of LBT on the field.
         * Right hand side area of the last grid point is expanded on the last line to the infinity.
         * @param nextBreakPointIndex returns the number of unique points on x axis.
         * In the case of SBT and LBT with the strike price 100, x = 0,100,200 are the unique points
         * and the number is 3.
         */
        uint256 numOfBreakPoints = 0;
        for (uint256 i = 0; i < bondIDs.length; i++) {
            BondInfo storage bond = _bonds[bondIDs[i]];
            require(
                bond.maturity == maturity,
                "the maturity of the bonds must be same"
            );
            LineSegment[] storage polyline = _registeredFnMap[bond.fnMapID];
            numOfBreakPoints = numOfBreakPoints.add(polyline.length);
        }

        uint256 nextBreakPointIndex = 0;
        uint64[] memory rateBreakPoints = new uint64[](numOfBreakPoints);
        for (uint256 i = 0; i < bondIDs.length; i++) {
            BondInfo storage bond = _bonds[bondIDs[i]];
            LineSegment[] storage segments = _registeredFnMap[bond.fnMapID];
            for (uint256 j = 0; j < segments.length; j++) {
                uint64 breakPoint = segments[j].right.x;
                bool ok = false;

                for (uint256 k = 0; k < nextBreakPointIndex; k++) {
                    if (rateBreakPoints[k] == breakPoint) {
                        ok = true;
                        break;
                    }
                }

                if (ok) {
                    continue;
                }

                rateBreakPoints[nextBreakPointIndex] = breakPoint;
                nextBreakPointIndex++;
            }
        }

        for (uint256 k = 0; k < rateBreakPoints.length; k++) {
            uint64 rate = rateBreakPoints[k];
            uint256 totalBondPriceN = 0;
            uint256 totalBondPriceD = 1;
            for (uint256 i = 0; i < bondIDs.length; i++) {
                BondInfo storage bond = _bonds[bondIDs[i]];
                LineSegment[] storage segments = _registeredFnMap[bond.fnMapID];
                (uint256 segmentIndex, bool ok) = _correspondSegment(
                    segments,
                    rate
                );

                require(ok, "invalid domain expression");

                (uint128 n, uint64 d) = _mapXtoY(segments[segmentIndex], rate);

                if (n != 0) {
                    // totalBondPrice += (n / d);
                    // N = D*n + N*d, D = D*d
                    totalBondPriceN = totalBondPriceD.mul(n).add(
                        totalBondPriceN.mul(d)
                    );
                    totalBondPriceD = totalBondPriceD.mul(d);
                }
            }
            /**
             * @dev Ensure that totalBondPrice (= totalBondPriceN / totalBondPriceD) is the same
             * with rate. Because we need 1 Ether to mint a unit of each bond token respectively,
             * the sum of strike price (USD) per a unit of bond token is the same with USD/ETH
             * rate at maturity.
             */
            require(
                totalBondPriceN == totalBondPriceD.mul(rate),
                "the total price at any rateBreakPoints should be the same value as the rate"
            );
        }
    }

    /**
     * @notice Collect bondIDs that regenerate the original ETH, and group them as a bond group.
     * Any bond is described as a set of linear functions(i.e. polyline),
     * so we can easily check if the set of bondIDs are well-formed by looking at all the end
     * points of the lines.
     */
    function registerNewBondGroup(bytes32[] memory bondIDs, uint256 maturity)
        public
        override
        returns (uint256 bondGroupID)
    {
        _assertBondGroup(bondIDs, maturity);

        // Get and increment next bond group ID
        bondGroupID = nextBondGroupID;
        nextBondGroupID = nextBondGroupID.add(1);

        _bondGroupList[bondGroupID] = BondGroup(bondIDs, maturity);

        emit LogNewBondGroup(bondGroupID);

        return bondGroupID;
    }

    /**
     * @notice A user needs to issue a bond via BondGroup in order to guarantee that the total value
     * of bonds in the bond group equals to the input Ether except for about 0.2% fee (accurately 2/1002).
     */
    function issueNewBonds(uint256 bondGroupID)
        public
        override
        payable
        returns (uint256)
    {
        BondGroup storage bondGroup = _bondGroupList[bondGroupID];
        bytes32[] storage bondIDs = bondGroup.bondIDs;
        require(
            _getBlockTimestampSec() < bondGroup.maturity,
            "the maturity has already expired"
        );

        uint256 fee = msg.value.mul(2).div(1002);

        uint256 amount = msg.value.sub(fee).div(10**10); // ether's decimal is 18 and that of LBT is 8;

        bytes32 bondID;
        for (
            uint256 bondFnMapIndex = 0;
            bondFnMapIndex < bondIDs.length;
            bondFnMapIndex++
        ) {
            bondID = bondIDs[bondFnMapIndex];
            _issueNewBond(bondID, msg.sender, amount);
        }

        _transferETH(payable(LIEN_TOKEN_ADDRESS), fee);

        emit LogIssueNewBonds(bondGroupID, msg.sender, amount);

        return amount;
    }

    /**
     * @notice redeems ETH from the total set of bonds in the bondGroupID before maturity date.
     */
    function reverseBondToETH(uint256 bondGroupID, uint256 amountE8)
        public
        override
        returns (bool)
    {
        BondGroup storage bondGroup = _bondGroupList[bondGroupID];
        bytes32[] storage bondIDs = bondGroup.bondIDs;
        require(
            _getBlockTimestampSec() < bondGroup.maturity,
            "the maturity has already expired"
        );
        bytes32 bondID;
        for (
            uint256 bondFnMapIndex = 0;
            bondFnMapIndex < bondIDs.length;
            bondFnMapIndex++
        ) {
            bondID = bondIDs[bondFnMapIndex];
            _burnBond(bondID, msg.sender, amountE8);
        }

        _transferETH(
            msg.sender,
            amountE8.mul(10**10),
            "system error: insufficient Ether balance"
        );

        emit LogReverseBondToETH(bondGroupID, msg.sender, amountE8.mul(10**10));

        return true;
    }

    /**
     * @notice Burns set of LBTs and mints equivalent set of LBTs that are not in the exception list.
     * @param inputBondGroupID is the BondGroupID of bonds which you want to burn.
     * @param outputBondGroupID is the BondGroupID of bonds which you want to mint.
     * @param exceptionBonds is the list of bondIDs that should be excluded in burn/mint process.
     */
    function exchangeEquivalentBonds(
        uint256 inputBondGroupID,
        uint256 outputBondGroupID,
        uint256 amount,
        bytes32[] memory exceptionBonds
    ) public override returns (bool) {
        (bytes32[] memory inputIDs, uint256 inputMaturity) = getBondGroup(
            inputBondGroupID
        );
        (bytes32[] memory outputIDs, uint256 outputMaturity) = getBondGroup(
            outputBondGroupID
        );
        require(
            inputMaturity == outputMaturity,
            "cannot exchange bonds with different maturities"
        );
        require(
            _getBlockTimestampSec() < inputMaturity,
            "the maturity has already expired"
        );
        bool flag;

        uint256 exceptionCount;
        for (uint256 i = 0; i < inputIDs.length; i++) {
            // this flag control checks whether the bond is in the scope of burn/mint
            flag = true;
            for (uint256 j = 0; j < exceptionBonds.length; j++) {
                if (exceptionBonds[j] == inputIDs[i]) {
                    flag = false;
                    // this count checks if all the bondIDs in exceptionBonds are included both in inputBondGroupID and outputBondGroupID
                    exceptionCount = exceptionCount.add(1);
                }
            }
            if (flag) {
                _burnBond(inputIDs[i], msg.sender, amount);
            }
        }

        require(
            exceptionBonds.length == exceptionCount,
            "All the exceptionBonds need to be included in input"
        );

        for (uint256 i = 0; i < outputIDs.length; i++) {
            flag = true;
            for (uint256 j = 0; j < exceptionBonds.length; j++) {
                if (exceptionBonds[j] == outputIDs[i]) {
                    flag = false;
                    exceptionCount = exceptionCount.sub(1);
                }
            }
            if (flag) {
                _issueNewBond(outputIDs[i], msg.sender, amount);
            }
        }

        require(
            exceptionCount == 0,
            "All the exceptionBonds need to be included both in input and output"
        );

        emit LogExchangeEquivalentBonds(
            msg.sender,
            inputBondGroupID,
            outputBondGroupID,
            amount
        );

        return true;
    }

    /**
     * @notice Distributes ETH to the bond token holders after maturity date based on the oracle price.
     * @param oracleHintID is manyally set to be smaller number than the oracle latestId when the caller wants to save gas.
     */
    function liquidateBond(uint256 bondGroupID, uint256 oracleHintID)
        public
        override
    {
        if (oracleHintID == 0) {
            _distributeETH2BondTokenContract(
                bondGroupID,
                _oracleContract.latestId()
            );
        } else {
            _distributeETH2BondTokenContract(bondGroupID, oracleHintID);
        }
    }

    /**
     * @notice Returns multiple information for the bondID.
     */
    function getBond(bytes32 bondID)
        public
        override
        view
        returns (
            address bondTokenAddress,
            uint256 maturity,
            uint64 solidStrikePrice,
            bytes32 fnMapID
        )
    {
        BondInfo memory bondInfo = _bonds[bondID];
        bondTokenAddress = address(bondInfo.contractInstance);
        maturity = bondInfo.maturity;
        solidStrikePrice = bondInfo.solidStrikePriceE4;
        fnMapID = bondInfo.fnMapID;
    }

    /**
     * @dev Returns polyline for the fnMapID.
     */
    function getFnMap(bytes32 fnMapID)
        public
        override
        view
        returns (bytes memory)
    {
        LineSegment[] storage segments = _registeredFnMap[fnMapID];
        uint256[] memory polyline = new uint256[](segments.length);
        for (uint256 i = 0; i < segments.length; i++) {
            polyline[i] = zipLineSegment(segments[i]);
        }
        return abi.encode(polyline);
    }

    /**
     * @dev Returns all the bondIDs and their maturity for the bondGroupID.
     */
    function getBondGroup(uint256 bondGroupID)
        public
        virtual
        override
        view
        returns (bytes32[] memory bondIDs, uint256 maturity)
    {
        BondGroup memory bondGroup = _bondGroupList[bondGroupID];
        bondIDs = bondGroup.bondIDs;
        maturity = bondGroup.maturity;
    }

    /**
     * @dev Returns keccak256 for the fnMap.
     */
    function generateFnMapID(bytes memory fnMap) public pure returns (bytes32) {
        return keccak256(fnMap);
    }

    /**
     * @dev Returns keccak256 for the pair of maturity and fnMap.
     */
    function generateBondID(uint256 maturity, bytes memory fnMap)
        public
        override
        pure
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(maturity, fnMap));
    }

    function _createNewBondToken(string memory name, string memory symbol)
        internal
        virtual
        returns (BondToken)
    {
        return new BondToken(name, symbol);
    }

    function _issueNewBond(
        bytes32 bondID,
        address account,
        uint256 amount
    ) internal {
        BondToken bondTokenContract = _bonds[bondID].contractInstance;
        require(
            address(bondTokenContract) != address(0),
            "the bond is not registered"
        );
        require(
            bondTokenContract.mint(account, amount),
            "failed to mint bond token"
        );
    }

    function _burnBond(
        bytes32 bondID,
        address account,
        uint256 amount
    ) internal {
        BondToken bondTokenContract = _bonds[bondID].contractInstance;
        require(
            address(bondTokenContract) != address(0),
            "the bond is not registered"
        );
        require(
            bondTokenContract.simpleBurn(account, amount),
            "failed to burn bond token"
        );
    }

    function _distributeETH2BondTokenContract(
        uint256 bondGroupID,
        uint256 oracleHintID
    ) internal {
        BondGroup storage bondGroup = _bondGroupList[bondGroupID];
        require(bondGroup.bondIDs.length > 0, "the bond group does not exist");
        require(
            _getBlockTimestampSec() >= bondGroup.maturity,
            "the bond has not expired yet"
        );

        // rateETH2USDE8 is the USD/ETH price multiplied by 10^8 returned from the oracle.
        uint256 rateETH2USDE8 = _getPriceOn(bondGroup.maturity, oracleHintID);

        // rateETH2USDE8 needs to be converted to rateETH2USDE4 as to match the decimal of the
        // values in segment.
        uint256 rateETH2USDE4 = rateETH2USDE8.div(10000);
        require(
            rateETH2USDE4 != 0,
            "system error: rate should be non-zero value"
        );
        require(
            rateETH2USDE4 < 2**64,
            "system error: rate should be less than the maximum value of uint64"
        );

        for (uint256 i = 0; i < bondGroup.bondIDs.length; i++) {
            bytes32 bondID = bondGroup.bondIDs[i];
            BondToken bondTokenContract = _bonds[bondID].contractInstance;
            require(
                address(bondTokenContract) != address(0),
                "the bond is not registered"
            );

            LineSegment[] storage segments = _registeredFnMap[_bonds[bondID]
                .fnMapID];

            (uint256 segmentIndex, bool ok) = _correspondSegment(
                segments,
                uint64(rateETH2USDE4)
            );

            require(
                ok,
                "system error: did not found a segment whose price range include USD/ETH rate"
            );
            LineSegment storage segment = segments[segmentIndex];
            (uint128 n, uint64 _d) = _mapXtoY(segment, uint64(rateETH2USDE4));

            // uint64(-1) *  uint64(-1) < uint128(-1)
            uint128 d = uint128(_d) * uint128(rateETH2USDE4);

            uint256 totalSupply = bondTokenContract.totalSupply();
            bool expiredFlag = bondTokenContract.expire(n, d);

            if (expiredFlag) {
                uint256 payment = totalSupply.mul(10**(18 - 8)).mul(n).div(d);
                _transferETH(
                    address(bondTokenContract),
                    payment,
                    "system error: BondMaker's balance is less than payment"
                );
            }
        }
    }

    /**
     * @dev Return the strike price only when the form of polyline matches to the definition of SBT.
     * Check if the form is SBT even when the polyline is in a verbose style.
     */
    function _getSolidStrikePrice(LineSegment[] memory polyline)
        internal
        pure
        returns (uint64)
    {
        uint64 solidStrikePrice = polyline[0].right.x;

        if (solidStrikePrice == 0) {
            return 0;
        }

        for (uint256 i = 0; i < polyline.length; i++) {
            LineSegment memory segment = polyline[i];
            if (segment.right.y != solidStrikePrice) {
                return 0;
            }
        }

        return uint64(solidStrikePrice);
    }

    /**
     * @dev Only when the form of polyline matches to the definition of LBT, this function returns
     * the minimum USD/ETH rate that LBT is not worthless.
     * Check if the form is LBT even when the polyline is in a verbose style.
     */
    function _getRateLBTWorthless(LineSegment[] memory polyline)
        internal
        pure
        returns (uint64)
    {
        uint64 rateLBTWorthless = polyline[0].right.x;

        if (rateLBTWorthless == 0) {
            return 0;
        }

        for (uint256 i = 0; i < polyline.length; i++) {
            LineSegment memory segment = polyline[i];
            if (segment.right.y.add(rateLBTWorthless) != segment.right.x) {
                return 0;
            }
        }

        return uint64(rateLBTWorthless);
    }

    /**
     * @dev In order to calculate y axis value for the corresponding x axis value, we need to find
     * the place of domain of x value on the polyline.
     * As the polyline is already checked to be correctly formed, we can simply look from the right
     * hand side of the polyline.
     */
    function _correspondSegment(LineSegment[] memory segments, uint64 x)
        internal
        pure
        returns (uint256 i, bool ok)
    {
        i = segments.length;
        while (i > 0) {
            i--;
            if (segments[i].left.x <= x) {
                ok = true;
                break;
            }
        }
    }
}

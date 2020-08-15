pragma solidity 0.6.6;

import "./BondMaker.sol";
import "./bondToken/BondToken.test.sol";


contract TestBondMaker is BondMaker {
    constructor(
        address oracleAddress,
        address lienTokenAddress,
        address bondTokenNameAddress
    ) public BondMaker(oracleAddress, lienTokenAddress, bondTokenNameAddress) {}

    function testIssueBond(
        bytes32 bondID,
        address receiver,
        uint256 amount
    ) public {
        _issueNewBond(bondID, receiver, amount);
    }

    function testGetFnMapProperties(bytes calldata fnMap)
        external
        pure
        returns (uint64, uint64)
    {
        uint256[] memory polyline = decodePolyline(fnMap);
        LineSegment[] memory unzipedPolyline = new LineSegment[](
            polyline.length
        );
        for (uint256 i = 0; i < polyline.length; i++) {
            unzipedPolyline[i] = unzipLineSegment(polyline[i]);
        }

        assertPolyline(unzipedPolyline);
        uint64 solidStrikePrice = _getSolidStrikePrice(unzipedPolyline);
        uint64 rateLBTWorthless = _getRateLBTWorthless(unzipedPolyline);
        return (solidStrikePrice, rateLBTWorthless);
    }

    function _createNewBondToken(string memory name, string memory symbol)
        internal
        override
        returns (BondToken bondTokenContract)
    {
        bondTokenContract = new TestBondToken(name, symbol);
    }
}

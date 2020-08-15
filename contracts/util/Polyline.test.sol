pragma solidity 0.6.6;

import "./Polyline.sol";


contract TestPolyline is Polyline {
    function testUnzipLineSegment(bytes32 zip)
        public
        pure
        returns (
            uint64 x1,
            uint64 y1,
            uint64 x2,
            uint64 y2
        )
    {
        LineSegment memory segment = unzipLineSegment(uint256(zip));
        x1 = segment.left.x;
        y1 = segment.left.y;
        x2 = segment.right.x;
        y2 = segment.right.y;
    }

    function testZipLineSegment(
        uint64 x1,
        uint64 y1,
        uint64 x2,
        uint64 y2
    ) public pure returns (bytes32 zip) {
        zip = bytes32(
            zipLineSegment(
                LineSegment({
                    left: Point({x: x1, y: y1}),
                    right: Point({x: x2, y: y2})
                })
            )
        );
    }
}

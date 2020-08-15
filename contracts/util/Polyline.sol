pragma solidity 0.6.6;

import "../math/UseSafeMath.sol";


contract Polyline is UseSafeMath {
    struct Point {
        uint64 x; // Value of the x-axis of the x-y plane
        uint64 y; // Value of the y-axis of the x-y plane
    }

    struct LineSegment {
        Point left; // The left end of the line definition range
        Point right; // The right end of the line definition range
    }

    /**
     * @notice Return the value of y corresponding to x on the given line line in the form of
     * a rational number (numerator / denominator).
     * If you treat a line as a line segment instead of a line, you should run
     * includesDomain(line, x) to check whether x is included in the line's domain or not.
     * @dev To guarantee accuracy, the bit length of the denominator must be greater than or equal
     * to the bit length of x, and the bit length of the numerator must be greater than or equal
     * to the sum of the bit lengths of x and y.
     */
    function _mapXtoY(LineSegment memory line, uint64 x)
        internal
        pure
        returns (uint128 numerator, uint64 denominator)
    {
        int256 x1 = int256(line.left.x);
        int256 y1 = int256(line.left.y);
        int256 x2 = int256(line.right.x);
        int256 y2 = int256(line.right.y);

        require(x2 > x1, "must be left.x < right.x");

        denominator = uint64(x2 - x1);

        // Calculate y = ((x2 - x) * y1 + (x - x1) * y2) / (x2 - x1)
        // in the form of a fraction (numerator / denominator).
        int256 n = (x - x1) * y2 + (x2 - x) * y1;

        require(n >= 0, "underflow n");
        require(n < 2**128, "system error: overflow n");
        numerator = uint128(n);
    }

    /**
     * @notice Checking that a line segment is a line segment of a valid format.
     */
    function assertLineSegment(LineSegment memory segment) internal pure {
        uint64 x1 = segment.left.x;
        uint64 x2 = segment.right.x;
        require(x1 < x2, "must be left.x < right.x");
    }

    /**
     * @notice Checking that a polyline is a line graph of a valid form.
     */
    function assertPolyline(LineSegment[] memory polyline) internal pure {
        uint256 numOfSegment = polyline.length;
        require(numOfSegment > 0, "polyline must not be empty array");

        // About the first line segment.
        LineSegment memory firstSegment = polyline[0];

        // The beginning of the first line segment's domain is 0.
        require(
            firstSegment.left.x == uint64(0),
            "the x coordinate of left end of the first segment is 0"
        );
        // The value of y when x is 0 is 0.
        require(
            firstSegment.left.y == uint64(0),
            "the y coordinate of left end of the first segment is 0"
        );

        // About the last line segment.
        LineSegment memory lastSegment = polyline[numOfSegment - 1];

        // The slope of the last line segment should be between 0 and 1.
        int256 gradientNumerator = int256(lastSegment.right.y).sub(
            lastSegment.left.y
        );
        int256 gradientDenominator = int256(lastSegment.right.x).sub(
            lastSegment.left.x
        );
        require(
            gradientNumerator >= 0 && gradientNumerator <= gradientDenominator,
            "the gradient of last line segment must be non-negative number equal to or less than 1"
        );

        // Making sure that the first line segment is in the correct format.
        assertLineSegment(firstSegment);

        // The end of the domain of a segment and the beginning of the domain of the adjacent
        // segment coincide.
        for (uint256 i = 1; i < numOfSegment; i++) {
            LineSegment memory leftSegment = polyline[i - 1];
            LineSegment memory rightSegment = polyline[i];

            // Make sure that the i-th line segment is in the correct format.
            assertLineSegment(rightSegment);

            // Checking that the x-coordinates are same.
            require(
                leftSegment.right.x == rightSegment.left.x,
                "given polyline is not single-valued function."
            );

            // Checking that the y-coordinates are same.
            require(
                leftSegment.right.y == rightSegment.left.y,
                "given polyline is not continuous function"
            );
        }
    }

    /**
     * @notice zip a LineSegment structure to uint256
     * @return zip uint256( 0 ... 0 | x1 | y1 | x2 | y2 )
     */
    function zipLineSegment(LineSegment memory segment)
        internal
        pure
        returns (uint256 zip)
    {
        uint256 x1U256 = uint256(segment.left.x) << (64 + 64 + 64); // uint64
        uint256 y1U256 = uint256(segment.left.y) << (64 + 64); // uint64
        uint256 x2U256 = uint256(segment.right.x) << 64; // uint64
        uint256 y2U256 = uint256(segment.right.y); // uint64
        zip = x1U256 | y1U256 | x2U256 | y2U256;
    }

    /**
     * @notice unzip uint256 to a LineSegment structure
     */
    function unzipLineSegment(uint256 zip)
        internal
        pure
        returns (LineSegment memory)
    {
        uint64 x1 = uint64(zip >> (64 + 64 + 64));
        uint64 y1 = uint64(zip >> (64 + 64));
        uint64 x2 = uint64(zip >> 64);
        uint64 y2 = uint64(zip);
        return
            LineSegment({
                left: Point({x: x1, y: y1}),
                right: Point({x: x2, y: y2})
            });
    }

    /**
     * @notice unzip the fnMap to uint256[].
     */
    function decodePolyline(bytes memory fnMap)
        internal
        pure
        returns (uint256[] memory)
    {
        return abi.decode(fnMap, (uint256[]));
    }
}

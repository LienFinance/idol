pragma solidity 0.6.6;

import {OrderType, OrderTypeLibrary} from "./Enums.sol";
import "./RateMath.sol";

struct BoxExecutionStatus {
    OrderType partiallyRefundOrderType;
    uint64 partiallyRefundRate; // refundAmount/inAmount
    uint128 rate; // Token0/Token1
    uint32 boxNumber;
    bool onGoing;
}

struct BookExecutionStatus {
    OrderType executingOrderType;
    uint256 nextIndex;
}


library BoxExecutionStatusLibrary {
    using OrderTypeLibrary for OrderType;

    function refundRate(BoxExecutionStatus memory self, OrderType orderType)
        internal
        pure
        returns (uint256)
    {
        // inToken is different from refundOrderType
        if (self.partiallyRefundOrderType.inToken() != orderType.inToken()) {
            return 0;
        }

        // inToken is the same as refundOrderType
        // refund all of strict order and some of flex order
        if (self.partiallyRefundOrderType.isFlex()) {
            // orderType is flex
            if (orderType.isFlex()) {
                return self.partiallyRefundRate;
            }
            // orderType is strict
            return RateMath.RATE_POINT_MULTIPLIER;
        }

        // refund some of strict order
        if (orderType.isStrict()) {
            return self.partiallyRefundRate;
        }
        return 0;
    }
}

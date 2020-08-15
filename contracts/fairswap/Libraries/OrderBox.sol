pragma solidity 0.6.6;
import {Token, TokenLibrary, OrderType} from "./Enums.sol";
import "../../../node_modules/@openzeppelin/contracts/math/SafeMath.sol";
import "./RateMath.sol";

struct OrderBox {
    mapping(OrderType => OrderBook) orderBooks;
    uint128 spreadRate;
    uint128 expireAt;
}

struct OrderBook {
    mapping(address => uint256) inAmounts;
    address[] recipients;
    uint256 totalInAmount;
}


library OrderBoxLibrary {
    using RateMath for uint256;
    using SafeMath for uint256;
    using TokenLibrary for Token;

    function newOrderBox(uint128 spreadRate, uint128 expireAt)
        internal
        pure
        returns (OrderBox memory)
    {
        return OrderBox({spreadRate: spreadRate, expireAt: expireAt});
    }

    function addOrder(
        OrderBox storage self,
        OrderType orderType,
        uint256 inAmount,
        address recipient
    ) internal {
        OrderBook storage orderBook = self.orderBooks[orderType];
        if (orderBook.inAmounts[recipient] == 0) {
            orderBook.recipients.push(recipient);
        }
        orderBook.inAmounts[recipient] = orderBook.inAmounts[recipient].add(
            inAmount
        );
        orderBook.totalInAmount = orderBook.totalInAmount.add(inAmount);
    }
}


library OrderBookLibrary {
    function numOfOrder(OrderBook memory self) internal pure returns (uint256) {
        return self.recipients.length;
    }
}

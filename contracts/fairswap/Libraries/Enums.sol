pragma solidity 0.6.6;

enum Token {TOKEN0, TOKEN1}

// FLEX_0_1 => Swap TOKEN0 to TOKEN1, slippage is tolerate to 5%
// FLEX_1_0 => Swap TOKEN1 to TOKEN0, slippage is tolerate to 5%
// STRICT_0_1 => Swap TOKEN0 to TOKEN1, slippage is limited in 0.1%
// STRICT_1_0 => Swap TOKEN1 to TOKEN0, slippage is limited in 0.1%
enum OrderType {FLEX_0_1, FLEX_1_0, STRICT_0_1, STRICT_1_0}


library TokenLibrary {
    function another(Token self) internal pure returns (Token) {
        if (self == Token.TOKEN0) {
            return Token.TOKEN1;
        } else {
            return Token.TOKEN0;
        }
    }
}


library OrderTypeLibrary {
    function inToken(OrderType self) internal pure returns (Token) {
        if (self == OrderType.FLEX_0_1 || self == OrderType.STRICT_0_1) {
            return Token.TOKEN0;
        } else {
            return Token.TOKEN1;
        }
    }

    function isFlex(OrderType self) internal pure returns (bool) {
        return self == OrderType.FLEX_0_1 || self == OrderType.FLEX_1_0;
    }

    function isStrict(OrderType self) internal pure returns (bool) {
        return !isFlex(self);
    }

    function next(OrderType self) internal pure returns (OrderType) {
        return OrderType((uint256(self) + 1) % 4);
    }

    function isBuy(OrderType self) internal pure returns (bool) {
        return (self == OrderType.FLEX_0_1 || self == OrderType.STRICT_0_1);
    }
}

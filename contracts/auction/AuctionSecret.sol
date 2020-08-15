pragma solidity 0.6.6;


abstract contract AuctionSecret {
    /**
     * @param sender is the account who set this secret bid.
     * @param amount is target SBT amount.
     * @param IDOLamount is deposited iDOL amount attached to this secret bid.
     */
    struct Secret {
        address sender;
        uint64 amount;
        uint64 IDOLamount;
    }
    mapping(bytes32 => mapping(bytes32 => Secret)) public auctionSecret;

    function _setSecret(
        bytes32 auctionID,
        bytes32 secret,
        address sender,
        uint64 amount,
        uint64 IDOLamount
    ) internal returns (bool) {
        require(
            auctionSecret[auctionID][secret].sender == address(0),
            "Secret already exists"
        );
        require(sender != address(0), "the zero address cannot set secret");
        auctionSecret[auctionID][secret] = Secret({
            sender: sender,
            amount: amount,
            IDOLamount: IDOLamount
        });
        return true;
    }

    function _removeSecret(bytes32 auctionID, bytes32 secret)
        internal
        returns (bool)
    {
        delete auctionSecret[auctionID][secret];
        return true;
    }
}

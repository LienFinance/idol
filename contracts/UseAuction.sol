pragma solidity 0.6.6;

import "./Auction.sol";


abstract contract UseAuction {
    Auction internal immutable _auctionContract;

    constructor(address contractAddress) public {
        require(
            contractAddress != address(0),
            "contract should be non-zero address"
        );
        _auctionContract = Auction(contractAddress);
    }
}

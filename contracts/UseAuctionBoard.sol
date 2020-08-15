pragma solidity 0.6.6;

import "./AuctionBoard.sol";


abstract contract UseAuctionBoard {
    AuctionBoard internal immutable _auctionBoardContract;

    constructor(address contractAddress) public {
        require(
            contractAddress != address(0),
            "contract should be non-zero address"
        );
        _auctionBoardContract = AuctionBoard(contractAddress);
    }
}

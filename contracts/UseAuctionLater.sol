pragma solidity 0.6.6;

import "./Auction.sol";
import "./util/DeployerRole.sol";


abstract contract UseAuctionLater is DeployerRole {
    Auction internal _auctionContract;

    modifier isNotEmptyAuctionInstance() {
        require(
            address(_auctionContract) != address(0),
            "the auction contract is not set"
        );
        _;
    }

    /**
     * @dev This function is called only once when the code is initially deployed.
     */
    function setAuctionContract(address contractAddress) public onlyDeployer {
        require(
            address(_auctionContract) == address(0),
            "the auction contract is already registered"
        );
        require(
            contractAddress != address(0),
            "contract should be non-zero address"
        );
        _setAuctionContract(contractAddress);
    }

    function _setAuctionContract(address contractAddress) internal {
        _auctionContract = Auction(payable(contractAddress));
    }
}

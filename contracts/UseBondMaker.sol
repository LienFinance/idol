pragma solidity 0.6.6;

import "./BondMakerInterface.sol";


abstract contract UseBondMaker {
    BondMakerInterface internal immutable _bondMakerContract;

    constructor(address contractAddress) public {
        require(
            contractAddress != address(0),
            "contract should be non-zero address"
        );
        _bondMakerContract = BondMakerInterface(payable(contractAddress));
    }
}

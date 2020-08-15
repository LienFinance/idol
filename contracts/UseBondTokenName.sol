pragma solidity 0.6.6;

import "./bondTokenName/BondTokenNameInterface.sol";


abstract contract UseBondTokenName {
    BondTokenNameInterface internal immutable _bondTokenNameContract;

    constructor(address contractAddress) public {
        require(
            contractAddress != address(0),
            "contract should be non-zero address"
        );
        _bondTokenNameContract = BondTokenNameInterface(contractAddress);
    }
}

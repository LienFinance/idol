pragma solidity 0.6.6;

import "./DecentralizedOTC.sol";


contract TestDecentralizedOTC is DecentralizedOTC {
    constructor(
        address bondMaker,
        address oracle,
        address lien
    ) public DecentralizedOTC(bondMaker, oracle, lien) {}

    function _getEtherOraclePrice()
        internal
        override
        returns (uint256 etherPriceE4, uint256 volatilityE8)
    {
        etherPriceE4 = 190 * 10**4;
        volatilityE8 = 8 * 10000000;
    }
}

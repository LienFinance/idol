pragma solidity 0.6.6;

import "./BondToken.sol";


contract TestBondToken is BondToken {
    constructor(string memory name, string memory symbol)
        public
        BondToken(name, symbol)
    {}

    function getDeployer() public view returns (address deployer) {
        deployer = _deployer;
    }

    function setRate(uint128 rateNumerator, uint128 rateDenominator) public {
        _setRate(Frac128x128(rateNumerator, rateDenominator));
    }

    function testMint(address account, uint256 amount) public returns (bool) {
        _mint(account, amount);
        return true;
    }
}

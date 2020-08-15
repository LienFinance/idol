pragma solidity 0.6.6;


abstract contract DeployerRole {
    address internal immutable _deployer;

    modifier onlyDeployer() {
        require(
            _isDeployer(msg.sender),
            "only deployer is allowed to call this function"
        );
        _;
    }

    constructor() public {
        _deployer = msg.sender;
    }

    function _isDeployer(address account) internal view returns (bool) {
        return account == _deployer;
    }
}

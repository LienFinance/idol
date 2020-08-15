pragma solidity 0.6.6;

import "../DecentralizedOTC/ERC20Vestable.sol";


/**
 * @notice THIS FILE IS JUST A COPY FOR TEST. NOT TO BE USED IN MAINNET THEN THIS IS NOT FOR AUDIT.
 */

contract TestLienToken is ERC20Vestable {
    constructor() public ERC20("testLienToken", "testLien") {
        _setupDecimals(8);
    }

    function burn(uint256 _amount) external {
        _burn(msg.sender, _amount);
    }

    receive() external payable {}

    function mint(uint256 amount) external {
        _mint(msg.sender, amount);
    }
}

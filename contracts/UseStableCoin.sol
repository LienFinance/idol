pragma solidity 0.6.6;

import "./StableCoinInterface.sol";


abstract contract UseStableCoin {
    StableCoinInterface internal immutable _IDOLContract;

    constructor(address contractAddress) public {
        require(
            contractAddress != address(0),
            "contract should be non-zero address"
        );
        _IDOLContract = StableCoinInterface(contractAddress);
    }

    function _transferIDOLFrom(
        address from,
        address to,
        uint256 amount
    ) internal {
        _IDOLContract.transferFrom(from, to, amount);
    }

    function _transferIDOL(address to, uint256 amount) internal {
        _IDOLContract.transfer(to, amount);
    }

    function _transferIDOL(
        address to,
        uint256 amount,
        string memory errorMessage
    ) internal {
        require(_IDOLContract.balanceOf(address(this)) >= amount, errorMessage);
        _IDOLContract.transfer(to, amount);
    }
}

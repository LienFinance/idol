pragma solidity 0.6.6;

import "./TransferETHInterface.sol";


abstract contract TransferETH is TransferETHInterface {
    receive() external override payable {
        emit LogTransferETH(msg.sender, address(this), msg.value);
    }

    function _hasSufficientBalance(uint256 amount)
        internal
        view
        returns (bool ok)
    {
        address thisContract = address(this);
        return amount <= thisContract.balance;
    }

    /**
     * @notice transfer `amount` ETH to the `recipient` account with emitting log
     */
    function _transferETH(
        address payable recipient,
        uint256 amount,
        string memory errorMessage
    ) internal {
        require(_hasSufficientBalance(amount), errorMessage);
        (bool success, ) = recipient.call{value: amount}("");
        require(success, "transferring Ether failed");
        emit LogTransferETH(address(this), recipient, amount);
    }

    function _transferETH(address payable recipient, uint256 amount) internal {
        _transferETH(
            recipient,
            amount,
            "TransferETH: transfer amount exceeds balance"
        );
    }
}

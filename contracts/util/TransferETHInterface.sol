pragma solidity 0.6.6;


interface TransferETHInterface {
    receive() external payable;

    event LogTransferETH(
        address indexed from,
        address indexed to,
        uint256 value
    );
}

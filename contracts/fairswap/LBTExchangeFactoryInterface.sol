pragma solidity 0.6.6;


interface LBTExchangeFactoryInterface {
    /**
     * @notice Launches new exchange
     * @param bondGroupId ID of bondgroup which target LBT belongs to
     * @param place The place of target bond in the bondGroup
     * @param IDOLAmount Initial liquidity of iDOL
     * @param LBTAmount Initial liquidity of LBT
     * @dev Get strikeprice and maturity from bond maker contract
     **/
    function launchExchange(
        uint256 bondGroupId,
        uint256 place,
        uint256 IDOLAmount,
        uint256 LBTAmount
    ) external returns (address);

    /**
     * @notice Gets exchange address from Address of LBT
     * @param tokenAddress Address of LBT
     **/
    function addressToExchangeLookup(address tokenAddress)
        external
        view
        returns (address exchange);

    /**
     * @notice Gets exchange address from BondID of LBT
     * @param bondID
     **/
    function bondIDToExchangeLookup(bytes32 bondID)
        external
        view
        returns (address exchange);

    /**
     * @dev Initial supply of share token is equal to amount of iDOL
     * @dev If there is no share token, user can reinitialize exchange
     * @param token Address of LBT
     * @param IDOLAmount Amount of idol to be provided
     * @param LBTAmount Amount of LBT to be provided
     **/
    function initializeExchange(
        address token,
        uint256 IDOLAmount,
        uint256 LBTAmount
    ) external;
}

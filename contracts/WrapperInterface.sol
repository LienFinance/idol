pragma solidity 0.6.6;
pragma experimental ABIEncoderV2;


interface WrapperInterface {
    event LogRegisterBondAndBondGroup(
        uint256 indexed bondGroupID,
        bytes32[] bondIDs
    );
    event LogIssueIDOL(
        bytes32 indexed bondID,
        address indexed sender,
        bytes32 poolID,
        uint256 amount
    );

    event LogIssueLBT(
        bytes32 indexed bondID,
        address indexed sender,
        uint256 amount
    );

    function registerBondAndBondGroup(bytes[] calldata fnMaps, uint256 maturity)
        external
        returns (bool);

    /**
     * @notice swap (SBT -> LBT)
     * @param solidBondID is a solid bond ID
     * @param liquidBondID is a liquid bond ID
     * @param timeout (uniswap)
     * @param isLimit (uniswap)
     */
    function swapSBT2LBT(
        bytes32 solidBondID,
        bytes32 liquidBondID,
        uint256 SBTAmount,
        uint256 timeout,
        bool isLimit
    ) external;

    /**
     * @notice ETH -> LBT & iDOL
     * @param bondGroupID is a bond group ID
     * @return poolID is a pool ID
     * @return liquidBondAmount is LBT amount obtained
     * @return IDOLAmount is iDOL amount obtained
     */
    function issueLBTAndIDOL(uint256 bondGroupID)
        external
        payable
        returns (
            bytes32 poolID,
            uint256 liquidBondAmount,
            uint256 IDOLAmount
        );

    /**
     * @notice ETH -> iDOL
     * @param bondGroupID is a bond group ID
     * @param timeout (uniswap)
     * @param isLimit (uniswap)
     */
    function issueIDOLOnly(
        uint256 bondGroupID,
        uint256 timeout,
        bool isLimit
    ) external payable;

    /**
     * @notice ETH -> LBT
     * @param bondGroupID is a bond group ID
     * @param liquidBondID is a liquid bond ID
     * @param timeout (uniswap)
     * @param isLimit (uniswap)
     */
    function issueLBTOnly(
        uint256 bondGroupID,
        bytes32 liquidBondID,
        uint256 timeout,
        bool isLimit
    ) external payable;
}

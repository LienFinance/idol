pragma solidity 0.6.6;


interface BondMakerInterface {
    event LogNewBond(
        bytes32 indexed bondID,
        address bondTokenAddress,
        uint64 stableStrikePrice,
        bytes32 fnMapID
    );

    event LogNewBondGroup(uint256 indexed bondGroupID);

    event LogIssueNewBonds(
        uint256 indexed bondGroupID,
        address indexed issuer,
        uint256 amount
    );

    event LogReverseBondToETH(
        uint256 indexed bondGroupID,
        address indexed owner,
        uint256 amount
    );

    event LogExchangeEquivalentBonds(
        address indexed owner,
        uint256 indexed inputBondGroupID,
        uint256 indexed outputBondGroupID,
        uint256 amount
    );

    event LogTransferETH(
        address indexed from,
        address indexed to,
        uint256 value
    );

    function registerNewBond(uint256 maturity, bytes calldata fnMap)
        external
        returns (
            bytes32 bondID,
            address bondTokenAddress,
            uint64 solidStrikePrice,
            bytes32 fnMapID
        );

    function registerNewBondGroup(
        bytes32[] calldata bondIDList,
        uint256 maturity
    ) external returns (uint256 bondGroupID);

    function issueNewBonds(uint256 bondGroupID)
        external
        payable
        returns (uint256 amount);

    function reverseBondToETH(uint256 bondGroupID, uint256 amount)
        external
        returns (bool success);

    function exchangeEquivalentBonds(
        uint256 inputBondGroupID,
        uint256 outputBondGroupID,
        uint256 amount,
        bytes32[] calldata exceptionBonds
    ) external returns (bool);

    function liquidateBond(uint256 bondGroupID, uint256 oracleHintID) external;

    function getBond(bytes32 bondID)
        external
        view
        returns (
            address bondAddress,
            uint256 maturity,
            uint64 solidStrikePrice,
            bytes32 fnMapID
        );

    function getFnMap(bytes32 fnMapID)
        external
        view
        returns (bytes memory fnMap);

    function getBondGroup(uint256 bondGroupID)
        external
        view
        returns (bytes32[] memory bondIDs, uint256 maturity);

    function generateBondID(uint256 maturity, bytes calldata functionHash)
        external
        pure
        returns (bytes32 bondID);
}

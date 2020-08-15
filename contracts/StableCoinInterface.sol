pragma solidity 0.6.6;

import "../node_modules/@openzeppelin/contracts/token/ERC20/IERC20.sol";


interface StableCoinInterface is IERC20 {
    event LogIsAcceptableSBT(bytes32 indexed bondID, bool isAcceptable);

    event LogMintIDOL(
        bytes32 indexed bondID,
        address indexed owner,
        bytes32 poolID,
        uint256 obtainIDOLAmount,
        uint256 poolIDOLAmount
    );

    event LogBurnIDOL(
        bytes32 indexed bondID, // poolID?
        address indexed owner,
        uint256 burnIDOLAmount,
        uint256 unlockSBTAmount
    );

    event LogReturnLockedPool(
        bytes32 indexed poolID,
        address indexed owner,
        uint64 backIDOLAmount
    );

    event LogLambda(
        bytes32 indexed poolID,
        uint64 settledAverageAuctionPrice,
        uint256 totalSupply,
        uint256 lockedSBTValue
    );

    function getPoolInfo(bytes32 poolID)
        external
        view
        returns (
            uint64 lockedSBTTotal,
            uint64 unlockedSBTTotal,
            uint64 lockedPoolIDOLTotal,
            uint64 burnedIDOLTotal,
            uint64 soldSBTTotalInAuction,
            uint64 paidIDOLTotalInAuction,
            uint64 settledAverageAuctionPrice,
            bool isAllAmountSoldInAuction
        );

    function solidValueTotal() external view returns (uint256 solidValue);

    function isAcceptableSBT(bytes32 bondID) external returns (bool ok);

    function mint(
        bytes32 bondID,
        address recipient,
        uint64 lockAmount
    )
        external
        returns (
            bytes32 poolID,
            uint64 obtainIDOLAmount,
            uint64 poolIDOLAmount
        );

    function burnFrom(address account, uint256 amount) external;

    function unlockSBT(bytes32 bondID, uint64 burnAmount)
        external
        returns (uint64 rewardSBT);

    function startAuctionOnMaturity(bytes32 bondID) external;

    function startAuctionByMarket(bytes32 bondID) external;

    function setSettledAverageAuctionPrice(
        bytes32 bondID,
        uint64 totalPaidIDOL,
        uint64 SBTAmount,
        bool isLast
    ) external;

    function calcSBT2IDOL(uint256 solidBondAmount)
        external
        view
        returns (uint256 IDOLAmount);

    function returnLockedPool(bytes32[] calldata poolIDs)
        external
        returns (uint64 IDOLAmount);

    function generatePoolID(bytes32 bondID, uint64 count)
        external
        pure
        returns (bytes32 poolID);

    function getCurrentPoolID(bytes32 bondID)
        external
        view
        returns (bytes32 poolID);

    function getLockedPool(address user, bytes32 poolID)
        external
        view
        returns (uint64, uint64);
}

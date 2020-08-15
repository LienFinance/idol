pragma solidity 0.6.6;
import "./LBTBoxExchange.sol";
import "../BondMakerInterface.sol";


contract LBTExchangeFactory {
    uint256 private constant MAX_RATIONAL_MATURITY = 31536 * 10**12; // Set A.D. 11970 as sufficiently large number

    ERC20Interface private immutable IDOL;
    PriceCalculatorInterface private immutable priceCalc;
    SpreadCalculatorInterface private immutable spreadCalc;
    BondMakerInterface private immutable bondMaker;
    OracleInterface private immutable oracle;
    address private immutable marketFeeTaker;
    mapping(address => address) private addressToExchange;
    mapping(bytes32 => address) private bondIDtoExchange;

    event ExchangeLaunch(address indexed exchange);

    /**
     * @param _IDOL iDOL contract
     * @param _bondMaker Bond maker contract
     * @param _priceCalc Price Calculator contract
     * @param _marketFeeTaker Address of market fee taker (i.e. Lien Token)
     * @param _spreadCalc Spread Calculator contract
     * @param _oracle ETH/USD oracle
     **/
    constructor(
        ERC20Interface _IDOL,
        BondMakerInterface _bondMaker,
        PriceCalculatorInterface _priceCalc,
        address payable _marketFeeTaker,
        SpreadCalculatorInterface _spreadCalc,
        OracleInterface _oracle
    ) public {
        IDOL = _IDOL;
        marketFeeTaker = _marketFeeTaker;
        priceCalc = _priceCalc;
        bondMaker = _bondMaker;
        spreadCalc = _spreadCalc;
        oracle = _oracle;
    }

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
    ) external returns (address) {
        (
            bool isNormalLBT,
            uint256 maturity,
            uint256 strikePrice,
            address LBTAddress,
            bytes32 bondID
        ) = _isNormalLBT(bondGroupId, place);
        require(address(LBTAddress) != address(0), "LBT doesn't exist");
        ERC20Interface token = ERC20Interface(LBTAddress);
        string memory namePrefix = "SHARE-IDOL-";
        string memory tokenName = token.name();
        string memory shareName = string(
            abi.encodePacked(namePrefix, tokenName)
        );
        require(
            addressToExchange[LBTAddress] == address(0),
            "Exchange already exists"
        ); // There can be only one exchange per token

        LBTBoxExchange newExchange = new LBTBoxExchange(
            IDOL,
            token,
            priceCalc,
            marketFeeTaker,
            spreadCalc,
            oracle,
            isNormalLBT,
            maturity,
            strikePrice,
            shareName
        );
        address exchangeAddress = address(newExchange);
        addressToExchange[LBTAddress] = exchangeAddress;
        bondIDtoExchange[bondID] = exchangeAddress;
        emit ExchangeLaunch(exchangeAddress);

        initializeExchange(LBTAddress, IDOLAmount, LBTAmount);

        return exchangeAddress;
    }

    /**
     * @notice Gets exchange address from Address of LBT
     * @param tokenAddress Address of LBT
     **/
    function addressToExchangeLookup(address tokenAddress)
        external
        view
        returns (address exchange)
    {
        return addressToExchange[tokenAddress];
    }

    /**
     * @notice Gets exchange address from BondID of LBT
     * @param bondID
     **/
    function bondIDToExchangeLookup(bytes32 bondID)
        external
        view
        returns (address exchange)
    {
        return bondIDtoExchange[bondID];
    }

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
    ) public {
        ERC20Interface LBT = ERC20Interface(token);
        require(
            IDOL.transferFrom(msg.sender, address(this), IDOLAmount),
            "ERC20: cannot receive your iDOL"
        );
        require(
            LBT.transferFrom(msg.sender, address(this), LBTAmount),
            "ERC20: cannot receive your LBT"
        );
        address exchangeAddress = addressToExchange[token];
        require(exchangeAddress != address(0), "Exchange does not exist");

        IDOL.approve(exchangeAddress, IDOLAmount);
        LBT.approve(exchangeAddress, LBTAmount);
        LBTBoxExchange Exchange = LBTBoxExchange(payable(exchangeAddress));

        Exchange.initializeExchange(IDOLAmount, LBTAmount, IDOLAmount);
        Exchange.transfer(msg.sender, IDOLAmount);
    }

    /**
     * @notice Detect whether this LBT is Normal LBT or not
     * @param place Place of target bond in the bondGroup
     * @param isNormalLBT If true, this is Normal LBT
     * @param maturity Maturity of this LBT
     * @param strikePrice Strike price of this LBT (If no SBT in the bondGroup, return 0)
     * @param LBTAddress Address of this LBT
     **/
    function _isNormalLBT(uint256 bondGroupId, uint256 place)
        private
        view
        returns (
            bool isNormalLBT,
            uint256 maturity,
            uint256 strikePrice,
            address LBTAddress,
            bytes32 bondID
        )
    {
        bytes32[] memory bondIDs;
        (bondIDs, maturity) = bondMaker.getBondGroup(bondGroupId);
        bondID = bondIDs[place];
        // If length of bondgroup is not 2, this is not normal LBT
        if (bondIDs.length == 2) {
            for (uint256 i = 0; i < 2; i++) {
                (address bondAddress, , uint256 _strikePrice, ) = bondMaker
                    .getBond(bondIDs[i]);
                if (_strikePrice != 0) {
                    // Maturity of Normal LBT should be before A.D. 11970
                    if (maturity < MAX_RATIONAL_MATURITY) {
                        // If place of target bond is different from that of SBT, it's Normal LBT
                        isNormalLBT = (place != i);
                    }
                    strikePrice = _strikePrice;
                }
                if (i == place) {
                    LBTAddress = bondAddress;
                }
            }
        } else {
            (LBTAddress, , , ) = bondMaker.getBond(bondIDs[place]);
        }
    }
}

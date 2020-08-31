pragma solidity >=0.6.6;
import "./ERC20BoxExchange.sol";


contract ERC20ExchangeFactory {
    event ExchangeLaunch(address indexed exchange, address indexed token);
    address private immutable marketFeeTaker;
    PriceCalculatorInterface private immutable priceCalc;
    SpreadCalculatorInterface private immutable spreadCalc;
    ERC20Interface private immutable idol;
    mapping(address => mapping(address => address)) private oracleToTokenToExchange;

    /**
     * @param _idol iDOL contract
     * @param _marketFeeTaker Address of market fee taker (i.e. Lien Token)
     * @param _priceCalc Price Calculator contract
     * @param _spreadCalc Spread Calculator contract
     **/
    constructor(
        ERC20Interface _idol,
        address _marketFeeTaker,
        PriceCalculatorInterface _priceCalc,
        SpreadCalculatorInterface _spreadCalc
    ) public {
        marketFeeTaker = _marketFeeTaker;
        priceCalc = _priceCalc;
        spreadCalc = _spreadCalc;
        idol = _idol;
    }

    /**
     * @notice Launches new exchange
     * @param token ERC20 token of target exchange
     * @param iDOLAmount Initial liquidity in IDOL
     * @param tokenAmount Initial liquidity in ERC20 token
     * @param initialShare Initial supply of share token
     * @param oracle oracle of ERC20/USD. If there is no oracle, use address(0)
     **/
    function launchExchange(
        ERC20Interface token,
        uint256 iDOLAmount,
        uint256 tokenAmount,
        uint256 initialShare,
        OracleInterface oracle
    ) external returns (address exchange) {
        require(
            oracleToTokenToExchange[address(oracle)][address(token)] ==
                address(0),
            "Exchange is already launched"
        ); //There can be only one exchange per the pair of oracle and token
        require(
            address(token) != address(0) && address(token) != address(this),
            "Invalid token address"
        );
        string memory namePrefix = "SHARE-IDOL-";
        string memory tokenName = token.name();
        string memory shareName = string(
            abi.encodePacked(namePrefix, tokenName)
        );
        ERC20BoxExchange newExchange = new ERC20BoxExchange(
            idol,
            token,
            priceCalc,
            marketFeeTaker,
            spreadCalc,
            oracle,
            shareName
        );
        address exchangeAddress = address(newExchange);
        oracleToTokenToExchange[address(oracle)][address(
            token
        )] = exchangeAddress;
        emit ExchangeLaunch(exchangeAddress, address(token));
        initializeExchange(
            token,
            address(oracle),
            iDOLAmount,
            tokenAmount,
            initialShare
        );
        return exchangeAddress;
    }

    /**
     * @notice Gets exchange address from Address of ERC20 token and oracle
     * @param tokenAddress Address of ERC20
     **/
    function tokenToExchangeLookup(address tokenAddress, address oracleAddress)
        external
        view
        returns (address exchange)
    {
        return oracleToTokenToExchange[oracleAddress][tokenAddress];
    }

    /**
     * @dev If there is no share token, user can reinitialize exchange
     * @param token Address of ERC20 token of target exchange
     * @param oracleAddress Address of oracle of target exchange
     * @param iDOLAmount Amount of IDOL to be provided
     * @param tokenAmount Amount of ERC20 token to be provided
     * @param initialShare Initial supply of share token
     **/
    function initializeExchange(
        ERC20Interface token,
        address oracleAddress,
        uint256 iDOLAmount,
        uint256 tokenAmount,
        uint256 initialShare
    ) public {
        require(
            idol.transferFrom(msg.sender, address(this), iDOLAmount),
            "ERC20: cannot receive your IDOL"
        );
        require(
            token.transferFrom(msg.sender, address(this), tokenAmount),
            "ERC20: cannot receive your the other token"
        );


            address exchangeAddress
         = oracleToTokenToExchange[oracleAddress][address(token)];
        require(exchangeAddress != address(0), "Exchange does not exist");

        idol.approve(exchangeAddress, iDOLAmount);
        token.approve(exchangeAddress, tokenAmount);
        ERC20BoxExchange Exchange = ERC20BoxExchange(exchangeAddress);

        Exchange.initializeExchange(iDOLAmount, tokenAmount, initialShare);
        Exchange.transfer(msg.sender, initialShare);
    }
}

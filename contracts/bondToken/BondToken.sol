pragma solidity 0.6.6;

import "../util/TransferETH.sol"; // this contract has payable function
import "../../node_modules/@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./BondTokenInterface.sol";
import "../util/DeployerRole.sol";


contract BondToken is DeployerRole, BondTokenInterface, TransferETH, ERC20 {
    struct Frac128x128 {
        uint128 numerator;
        uint128 denominator;
    }

    Frac128x128 internal _rate;

    constructor(string memory name, string memory symbol)
        public
        ERC20(name, symbol)
    {
        _setupDecimals(8);
    }

    function mint(address account, uint256 amount)
        public
        virtual
        override
        onlyDeployer
        returns (bool success)
    {
        require(!isExpired(), "this token contract has expired");
        _mint(account, amount);
        return true;
    }

    function transfer(address recipient, uint256 amount)
        public
        override(ERC20, IERC20)
        returns (bool success)
    {
        _transfer(msg.sender, recipient, amount);
        return true;
    }

    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) public override(ERC20, IERC20) returns (bool success) {
        _transfer(sender, recipient, amount);
        _approve(
            sender,
            msg.sender,
            allowance(sender, msg.sender).sub(
                amount,
                "ERC20: transfer amount exceeds allowance"
            )
        );
        return true;
    }

    /**
     * @dev Record the settlement price at maturity in the form of a fraction and let the bond
     * token expire.
     */
    function expire(uint128 rateNumerator, uint128 rateDenominator)
        public
        override
        onlyDeployer
        returns (bool isFirstTime)
    {
        isFirstTime = !isExpired();
        if (isFirstTime) {
            _setRate(Frac128x128(rateNumerator, rateDenominator));
        }

        emit LogExpire(rateNumerator, rateDenominator, isFirstTime);
    }

    function simpleBurn(address from, uint256 amount)
        public
        onlyDeployer
        returns (bool)
    {
        if (amount > balanceOf(from)) {
            return false;
        }

        _burn(from, amount);
        return true;
    }

    function burn(uint256 amount) public override returns (bool success) {
        if (!isExpired()) {
            return false;
        }

        _burn(msg.sender, amount);

        if (_rate.numerator != 0) {
            uint256 withdrawAmount = amount
                .mul(10**(18 - 8))
                .mul(_rate.numerator)
                .div(_rate.denominator);
            _transferETH(
                msg.sender,
                withdrawAmount,
                "system error: insufficient balance"
            );
        }

        return true;
    }

    function burnAll() public override returns (uint256 amount) {
        amount = balanceOf(msg.sender);
        bool success = burn(amount);
        if (!success) {
            amount = 0;
        }
    }

    /**
     * @dev rateDenominator never be zero due to div() function, thus initial _rateDenominator is 0
     * can be used for flag of non-expired;
     */
    function isExpired() public view returns (bool) {
        return _rate.denominator != 0;
    }

    function isMinter(address account) public override view returns (bool) {
        return _isDeployer(account);
    }

    function getRate()
        public
        override
        view
        returns (uint128 rateNumerator, uint128 rateDenominator)
    {
        rateNumerator = _rate.numerator;
        rateDenominator = _rate.denominator;
    }

    function _setRate(Frac128x128 memory rate) internal {
        require(
            rate.denominator != 0,
            "system error: the exchange rate must be non-negative number"
        );
        _rate = rate;
    }
}

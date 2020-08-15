pragma solidity ^0.6.6;

import "../../node_modules/@openzeppelin/contracts/math/SafeMath.sol";
import "../../node_modules/@openzeppelin/contracts/token/ERC20/ERC20.sol";


/**
 * @notice THIS FILE IS JUST A COPY FOR TEST. NOT TO BE USED IN MAINNET THEN THIS IS NOT FOR AUDIT.
 */

/**
 * @notice Vestable ERC20 Token.
 * One beneficiary can have multiple grants.
 * Grants for one beneficiary are identified by unique ids from 1.
 * When some tokens are deposited to a grant, the tokens are transferred from the depositor to the beneficiary.
 * Tokens deposited to a grant become gradually spendable along with the elapsed time.
 * One grant has its unique start time and end time.
 * The vesting of the grant is directly proportionally to the elapsed time since the start time.
 * At the end time, all the tokens of the grant is finally vested.
 * When the beneficiary claims the vested tokens, the tokens become spendable.
 * You can additionally deposit tokens to the already started grants to increase the amount of the vesting.
 * In such a case, some part of the tokens immediately become vested proportionally to the elapsed time since the start time.
 */
abstract contract ERC20Vestable is ERC20 {
    using SafeMath for uint256;

    struct Grant {
        uint256 amount; // total of deposited tokens to the grant
        uint256 claimed; // total of claimed vesting of the grant
        uint256 startTime; // the time when the grant starts
        uint256 endTime; // the time when the grant ends
    }

    // account => Grant[]
    mapping(address => Grant[]) private grants;

    // account => amount
    mapping(address => uint256) private remainingGrants;

    /**
     * @notice Sum of not yet claimed grants.
     * It includes already vested but not claimed grants.
     */
    uint256 public totalRemainingGrant;

    event CreateGrant(
        address beneficiary,
        address creator,
        uint256 id,
        uint256 endTime
    );
    event DepositToGrant(
        address beneficiary,
        uint256 id,
        address depositor,
        uint256 amount
    );
    event ClaimVestedTokens(address beneficiary, uint256 id, uint256 amount);

    modifier spendable(address account, uint256 amount) {
        require(
            balanceOf(account).sub(remainingGrants[account]) >= amount,
            "transfer amount exceeds spendable balance"
        );
        _;
    }

    /**
     * @notice Creates new grant and starts it.
     * @param beneficiary receipt of vested tokens of the grant.
     * @param endTime Time at which all the tokens of the grant will be vested.
     * @return id of the grant.
     */
    function createGrant(address beneficiary, uint256 endTime)
        public
        returns (uint256)
    {
        require(endTime > now, "endTime is before now");
        Grant memory g = Grant(0, 0, now, endTime);
        address creator = msg.sender;
        grants[beneficiary].push(g);
        uint256 id = grants[beneficiary].length;
        emit CreateGrant(beneficiary, creator, id, endTime);
        return id;
    }

    /**
     * @notice Deposits tokens to grant.
     * @param beneficiary receipt of vested tokens of the grant.
     * @param id id of the grant.
     * @param amount amount of tokens.
     */
    function depositToGrant(
        address beneficiary,
        uint256 id,
        uint256 amount
    ) public {
        Grant storage g = _getGrant(beneficiary, id);
        address depositor = msg.sender;
        _transfer(depositor, beneficiary, amount);
        g.amount = g.amount.add(amount);
        remainingGrants[beneficiary] = remainingGrants[beneficiary].add(amount);
        totalRemainingGrant = totalRemainingGrant.add(amount);
        emit DepositToGrant(beneficiary, id, depositor, amount);
    }

    /**
     * @notice Claims spendable vested tokens of the grant which are vested after the last claiming.
     * @param beneficiary receipt of vested tokens of the grant.
     * @param id id of the grant.
     */
    function claimVestedTokens(address beneficiary, uint256 id) public {
        Grant storage g = _getGrant(beneficiary, id);
        uint256 amount = _vestedAmount(g);
        g.claimed = g.claimed.add(amount);
        remainingGrants[beneficiary] = remainingGrants[beneficiary].sub(amount);
        totalRemainingGrant = totalRemainingGrant.sub(amount);
        emit ClaimVestedTokens(beneficiary, id, amount);
    }

    /**
     * @notice Returns the last id of grant of `beneficiary`.
     * If `beneficiary` does not have any grant, returns `0`.
     */
    function getLastGrantID(address beneficiary) public view returns (uint256) {
        return grants[beneficiary].length;
    }

    /**
     * @notice Returns information of grant
     * @param beneficiary receipt of vested tokens of the grant.
     * @param id id of the grant.
     * @return amount is the total of deposited tokens
     * @return claimed is the total of already claimed spendable tokens.
     * @return  vested is the amount of vested and not claimed tokens.
     * @return startTime is the start time of grant.
     * @return  endTime is the end time time of grant.
     */
    function getGrant(address beneficiary, uint256 id)
        public
        view
        returns (
            uint256 amount,
            uint256 claimed,
            uint256 vested,
            uint256 startTime,
            uint256 endTime
        )
    {
        Grant storage g = _getGrant(beneficiary, id);
        amount = g.amount;
        claimed = g.claimed;
        vested = _vestedAmount(g);
        startTime = g.startTime;
        endTime = g.endTime;
    }

    /**
     * @notice Returns sum of not yet claimed tokens of `account`
     * It includes already vested but not claimed grants.
     */
    function remainingGrantOf(address account) public view returns (uint256) {
        return remainingGrants[account];
    }

    /**
     * @dev When `amount` exceeds spendable balance, it reverts.
     */
    function _transfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual override spendable(from, amount) {
        super._transfer(from, to, amount);
    }

    function _getGrant(address beneficiary, uint256 id)
        private
        view
        returns (Grant storage)
    {
        require(id > 0, "0 is invalid as id");
        require(id <= grants[beneficiary].length, "grant does not exist");
        return grants[beneficiary][id - 1];
    }

    /**
     * @dev Returns tokens that were vested after the last claiming.
     */
    function _vestedAmount(Grant storage g) private view returns (uint256) {
        uint256 n = now;
        if (g.endTime > n) {
            uint256 elapsed = n.sub(g.startTime);
            uint256 duration = g.endTime.sub(g.startTime);
            return g.amount.mul(elapsed).div(duration).sub(g.claimed);
        }
        return g.amount.sub(g.claimed);
    }
}

pragma solidity 0.6.6;


abstract contract Time {
    function _getBlockTimestampSec()
        internal
        view
        returns (uint256 unixtimesec)
    {
        unixtimesec = now; // solium-disable-line security/no-block-members
    }
}

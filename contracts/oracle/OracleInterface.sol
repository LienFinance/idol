pragma solidity ^0.6.6;


// Oracle referenced by OracleProxy must implement this interface.
interface OracleInterface {
    // Returns if oracle is running.
    function alive() external view returns (bool);

    // Returns latest id.
    // The first id is 1 and 0 value is invalid as id.
    // Each price values and theirs timestamps are identified by id.
    // Ids are assigned incrementally to values.
    function latestId() external returns (uint256);

    // Returns latest price value.
    // decimal 8
    function latestPrice() external returns (uint256);

    // Returns timestamp of latest price.
    function latestTimestamp() external returns (uint256);

    // Returns price of id.
    function getPrice(uint256 id) external returns (uint256);

    // Returns timestamp of id.
    function getTimestamp(uint256 id) external returns (uint256);

    function getVolatility() external returns (uint256);
}

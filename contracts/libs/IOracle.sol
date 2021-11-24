pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;
interface IOracle {
    function capture() external returns (uint256, bool);
    function set(uint256 numerator, uint256 denominator, bool valid) external;
}

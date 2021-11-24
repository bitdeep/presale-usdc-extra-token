pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/access/Ownable.sol";
import './mock/interfaces/IUniswapV2Router02.sol';
import './UniswapV2OracleLibrary.sol';
import "./libs/Decimal.sol";
contract Oracle is Ownable {
    using Decimal for Decimal.D256;
    address public _token;
    address public operator;
    bool public _initialized;
    IUniswapV2Pair public _pair;
    uint256 public _index;
    uint256 public _cumulative;
    uint32 public _timestamp;
    uint256 public _reserve;
    uint256 public ORACLE_RESERVE_MINIMUM = 1_000_000; // $1 usdc
    uint256 _price = 0;
    event OracleStatus(uint256 twap, bool status);
    function setup (address _operator, address token, address _PAIR) public onlyOwner {
        operator = _operator;
        _token = token;
        _pair = IUniswapV2Pair(_PAIR);
        (address token0, address token1) = (_pair.token0(), _pair.token1());
        _index = _token == token0 ? 0 : 1;
        require(_index == 0 || _token == token1, "token not found");
    }
    modifier onlyOperator {
        require(msg.sender == operator || msg.sender == owner(), "not operator");
        _;
    }
    function setOracleReserve(uint256 value) public onlyOwner {
        ORACLE_RESERVE_MINIMUM = value;
    }
    function setCaller(address _caller) public onlyOwner {
        operator = _caller;
    }
    function set(uint256 numerator, uint256 denominator, bool valid) external {
    }
    /**
     * Trades/Liquidity: (1) Initializes reserve and blockTimestampLast (can calculate a price)
     *                   (2) Has non-zero cumulative prices
     *
     * Steps: (1) Captures a reference blockTimestampLast
     *        (2) First reported value
     */

    function capture() public onlyOperator returns (uint256, bool) {
        if (_initialized) {
            return updateOracle();
        } else {
            initializeOracle();
            emit OracleStatus(Decimal.one().value, false);
            return (Decimal.one().value, false);
        }
    }
    function initializeOracle() private {
        IUniswapV2Pair pair = _pair;
        uint256 priceCumulative = _index == 0 ?
        pair.price0CumulativeLast() :
        pair.price1CumulativeLast();
        (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast) = pair.getReserves();
        if (reserve0 != 0 && reserve1 != 0 && blockTimestampLast != 0) {
            _cumulative = priceCumulative;
            _timestamp = blockTimestampLast;
            _initialized = true;
            _reserve = _index == 0 ? reserve1 : reserve0;
        }
    }

    bool valid = false;
    function updateOracle() private returns (uint256, bool) {
        uint256 price = updatePrice();
        uint256 lastReserve = updateReserve();
        valid = true;
        if (lastReserve < ORACLE_RESERVE_MINIMUM ) {
            valid = false;
        }
        if (_reserve < ORACLE_RESERVE_MINIMUM ) {
            valid = false;
        }
        emit OracleStatus(price, valid);
        return (price, valid);
    }


    function updatePrice() private returns (uint256) {
        (uint256 price0Cumulative, uint256 price1Cumulative, uint32 blockTimestamp) =
        UniswapV2OracleLibrary.currentCumulativePrices(address(_pair));
        uint32 timeElapsed = blockTimestamp - _timestamp;
        if( timeElapsed == 0 ){
            return _price;
        }
        // overflow is desired
        uint256 priceCumulative = _index == 0 ? price0Cumulative : price1Cumulative;
        Decimal.D256 memory price = Decimal.ratio((priceCumulative - _cumulative) / timeElapsed, 2 ** 112);
        _timestamp = blockTimestamp;
        _cumulative = priceCumulative;
        _price = price.value;
        return _price;
    }
    function updateReserve() private returns (uint256) {
        uint256 lastReserve = _reserve;
        (uint112 reserve0, uint112 reserve1,) = _pair.getReserves();
        _reserve = _index == 0 ? reserve1 : reserve0;
        // get counter's reserve
        return lastReserve;
    }
    function pair() external view returns (address) {
        return address(_pair);
    }
    function reserve() external view returns (uint256) {
        return _reserve;
    }
    function getTimetstamp() external view returns (uint256) {
        return _timestamp;
    }
    function getPriceCumulative() external view returns (uint256) {
        return _cumulative;
    }
    function getPrice() external view returns (uint256) {
        return _price;
    }
    function isValid() external view returns (bool) {
        return valid;
    }



}

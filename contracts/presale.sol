// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "./libs/ReentrancyGuard.sol";
import "./libs/IOracle.sol";

// TokenToken
contract PreSale is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    IOracle oracle;
    IERC20 tmpToken;
    IERC20 extraToken;
    IERC20 usdc;
    IERC20 finalToken;
    address public feeAddress;
    address public burnAddress = 0x000000000000000000000000000000000000dEaD;

    uint256 public PresalePrice;
    uint256 public ExtraTokenPrice;

    mapping(uint256 => uint256) public maxTokenPurchase;
    uint256 public maxTokenPurchaseWL1 = 100 ether;
    uint256 public maxTokenPurchaseWL2 = 100 ether;

    uint256 public startBlock;
    uint256 public endBlock;

    uint256 public swapStartBlock = 0; // swap start disabled
    uint256 public swapEndBlock = 0;

    mapping(address => bool) public userIsWL1;
    mapping(address => bool) public userIsWL2;
    mapping(address => uint256) public userTokenTally;

    event tokenPurchased(address sender, uint256 tokenReceived, uint256 usdcSpent, uint256 extraTokenSpent);
    event startBlockChanged(uint256 newStartBlock, uint256 newEndBlock);
    event Swap(address sender, uint256 swapAmount);

    uint8 public ratio;
    constructor(uint256 _startBlock, uint256 _endBlock, uint8 _ratio,
        uint256 _PresalePrice, IOracle _oracle,
        address _tmpToken, address _extraToken, address _usdc) public {
        startBlock = _startBlock;
        endBlock   = _endBlock;
        ratio = _ratio;
        PresalePrice = _PresalePrice;
        oracle = _oracle;
        tmpToken = IERC20(_tmpToken);
        extraToken = IERC20(_extraToken);
        usdc = IERC20(_usdc);
        tmpToken.balanceOf(address(this));
        extraToken.balanceOf(address(this));
        usdc.balanceOf(address(this));

    }

    // return the last block for testing
    function getBlock() public view returns(uint256){
        return block.number;
    }

    // pass any pApollo and receive the amount in USDC.
    function quoteAmountInReceipt(uint256 amount) public view returns(uint256){
        return amount.div(1e18).mul(PresalePrice);
    }
    // pass any pApollo and get the % amount in USDC
    function quoteAmountInUSDC(uint256 amount) public view returns(uint256){
        uint256 amountInReceipt = quoteAmountInReceipt(amount);
        return amountInReceipt.mul(ratio).div(100);
    }
    // pass any pApollo and get the % amount in ExtraToken
    function quoteAmountInExtraToken(uint256 amount) public view returns(uint256){
        if( ExtraTokenPrice == 0 ) return 0;
        uint256 amountInReceipt = quoteAmountInReceipt(amount);
        uint256 amountInUsdc = quoteAmountInUSDC(amount);
        uint256 amountInUsdcInExtraToken = amountInReceipt.sub(amountInUsdc);

        return amountInUsdcInExtraToken.mul(1e6).div(ExtraTokenPrice).mul( 1e6 );
    }

    // pass any pApollo and get quotes in USDC and ExtraToken
    function quoteAmounts(uint256 requestedAmount, address user) public view
    returns(uint256 ReceiptInUSD, uint256 inUsdc, uint256 amountExtraToken, uint256 limit, uint256 tokenPurchaseAmount){
        (tokenPurchaseAmount, limit) = getUserLimit(requestedAmount, user);
        ReceiptInUSD = quoteAmountInReceipt(tokenPurchaseAmount);
        inUsdc = quoteAmountInUSDC(tokenPurchaseAmount);
        amountExtraToken = quoteAmountInExtraToken(tokenPurchaseAmount);
    }
    function getUserLimit(uint256 tokenPurchaseAmount, address user) public view returns(uint256, uint256){
        uint256 limit = maxTokenPurchase[tokenPurchaseAmount];
        if(userIsWL1[user])
            limit = limit.add(maxTokenPurchaseWL1);
        if(userIsWL2[user])
            limit = limit.add(maxTokenPurchaseWL2);

        if (tokenPurchaseAmount > limit)
            tokenPurchaseAmount = limit;

        if (userTokenTally[user].add(tokenPurchaseAmount) > limit)
            tokenPurchaseAmount = limit.sub(userTokenTally[user]);

        // if we dont have enough left, give them the rest.
        if (tmpToken.balanceOf(address(this)) < tokenPurchaseAmount)
            tokenPurchaseAmount = tmpToken.balanceOf(address(this));

        return (tokenPurchaseAmount, limit);
    }
    function buy( uint256 amount ) external payable nonReentrant {

        require(block.number >= startBlock, "presale hasn't started yet, good things come to those that wait");
        require(block.number < endBlock, "presale has ended, come back next time!");
        require(tmpToken.balanceOf(address(this)) > 0, "No more Token left! Come back next time!");

        // ReceiptInUSD
        (, uint256 inUsdc, uint256 amountExtraToken, uint256 limit, uint256 tokenPurchaseAmount)
        = quoteAmounts(amount, msg.sender);

        getOracleExtraPrice();

        require(userTokenTally[msg.sender] < limit, "user has already purchased too much Token");
        require(tokenPurchaseAmount > 0, "user cannot purchase 0 Token");
        require(inUsdc > 0, "user cannot pay 0 USDC");
        // require(amountExtraToken > 0, "user cannot pay 0 ExtraToken");

        userTokenTally[msg.sender] = userTokenTally[msg.sender].add(tokenPurchaseAmount);


        uint256 userUsdcBalance = usdc.balanceOf(address(msg.sender));
        uint256 userExtraTokenBalance = extraToken.balanceOf(address(msg.sender));

        require(inUsdc <= userUsdcBalance, "USDC balance is too low");
        require(amountExtraToken <= userExtraTokenBalance, "ExtraToken balance is too low");

        usdc.safeTransferFrom(msg.sender, feeAddress, inUsdc);
        extraToken.safeTransferFrom(msg.sender, feeAddress, amountExtraToken);
        tmpToken.safeTransfer(msg.sender, tokenPurchaseAmount);

        emit tokenPurchased(msg.sender, tokenPurchaseAmount, inUsdc, amountExtraToken);

    }

    function setStartEndBlock(uint256 _startBlock, uint256 _endBlock) external onlyOwner {
        startBlock = _startBlock;
        endBlock   = _endBlock;
    }
    function setRatio(uint8 _ratio) external onlyOwner {
        ratio = _ratio;
    }
    function setPresalePrice(uint256 _PresalePrice) external onlyOwner {
        PresalePrice = _PresalePrice;
    }
    function setExtraTokenPrice(uint256 _ExtraTokenPrice) external onlyOwner {
        ExtraTokenPrice = _ExtraTokenPrice;
    }
    function setMaxTokenPurchase(uint256 v) external onlyOwner {
        maxTokenPurchase[v] = v;
    }
    function setMaxTokenPurchaseWL1(uint256 _value) external onlyOwner {
        maxTokenPurchaseWL1 = _value;
    }
    function setMaxTokenPurchaseWL2(uint256 _value) external onlyOwner {
        maxTokenPurchaseWL2 = _value;
    }
    function setFeeAddress(address _feeAddress) external onlyOwner {
        feeAddress = _feeAddress;
    }
    function setToken(address _token) external onlyOwner {
        tmpToken = IERC20(_token);
        tmpToken.balanceOf(address(this));
    }
    function setExtraToken(address _extraToken) external onlyOwner {
        extraToken = IERC20(_extraToken);
        extraToken.balanceOf(address(this));
    }
    function setUsdc(address _usdc) external onlyOwner {
        usdc = IERC20(_usdc);
        usdc.balanceOf(address(this));
    }
    function setUserIsWL1(address _user, bool _status) external onlyOwner {
        userIsWL1[_user] = _status;
    }
    function setUserIsWL2(address _user, bool _status) external onlyOwner {
        userIsWL2[_user] = _status;
    }


    function setSwapStart(uint256 _startBlock, uint256 _endBlock, address _token) external onlyOwner {
        swapStartBlock = _startBlock;
        swapEndBlock   = _endBlock;
        finalToken = IERC20(_token);
        finalToken.balanceOf(address(this));
        require( swapStartBlock > endBlock, "swap should start after token sell." );
        require( swapEndBlock > endBlock, "swap should end after token sell." );
        require( swapEndBlock > swapStartBlock, "start should > end." );
    }
    function burnUnclaimed() external onlyOwner {
        require(block.number > swapEndBlock && swapEndBlock > 0,
            "can only send excess to dead address after swap has ended");
        if (tmpToken.balanceOf(address(this)) > 0)
            tmpToken.safeTransfer(burnAddress, tmpToken.balanceOf(address(this)) );
        if (finalToken.balanceOf(address(this)) > 0)
            finalToken.safeTransfer(burnAddress, finalToken.balanceOf(address(this)) );
    }

    function swapAll() external nonReentrant {
        _swap( tmpToken.balanceOf(msg.sender) );
    }
    function swap(uint256 swapAmount) external nonReentrant {
        _swap(swapAmount);
    }
    function _swap(uint256 swapAmount) internal {
        require(swapStartBlock>0 && swapEndBlock>0, "swap redemption is disabled");
        require(block.number >= swapStartBlock, "redemption not started ");
        require(block.number <= swapEndBlock, "redemption finished");
        require(finalToken.balanceOf(address(this)) >= swapAmount, "Not Enough tokens in contract for swap");

        tmpToken.transferFrom(msg.sender, burnAddress, swapAmount);
        finalToken.safeTransfer(msg.sender, swapAmount);

        emit Swap(msg.sender, swapAmount);
    }
    function getOracleExtraPrice() public{
        (uint256 priceFromOracle, bool isValid) = oracle.capture();
        if( isValid && priceFromOracle > 0) ExtraTokenPrice = priceFromOracle;
    }
}

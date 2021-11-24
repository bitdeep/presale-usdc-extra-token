const web3 = require('web3');
const {accounts, contract} = require('@openzeppelin/test-environment');
const {BN, expectRevert, time, expectEvent, constants} = require('@openzeppelin/test-helpers');
const {expect} = require('chai');
const Token = contract.fromArtifact('FaucetERC20');
const Token6 = contract.fromArtifact('FaucetERC20');
const Token9 = contract.fromArtifact('FaucetERC20');
const ctx = contract.fromArtifact('PreSale');
// > uniswap
const WETH = contract.fromArtifact("WETH");
const IUniswapV2Pair = contract.fromArtifact("IUniswapV2Pair");
const UniswapV2Factory = contract.fromArtifact("UniswapV2Factory");
const UniswapV2Router02 = contract.fromArtifact("UniswapV2Router02");

// < uniswap
const chalk = require('chalk');
let _yellowBright = chalk.yellowBright;
let _magenta = chalk.magenta;
let _cyan = chalk.cyan;
let _yellow = chalk.yellow;
let _red = chalk.red;
let _blue = chalk.blue;
let _green = chalk.green;

function yellow() {
    console.log(_yellow(...arguments));
}

function red() {
    console.log(_red(...arguments));
}

function green() {
    console.log(_green(...arguments));
}

function blue() {
    console.log(_blue(...arguments));
}

function cyan() {
    console.log(_cyan(...arguments));
}

function magenta() {
    console.log(_magenta(...arguments));
}

const startBlock = 0;
const endBlock = 1999999999;
let dev, user, fee;
let amount, ratio, ReceiptTokenPrice, ExtraPrice;

function fromWei(v) {
    if (!v) return '-';
    return web3.utils.fromWei(v.toString(), 'ether').toString();
}

function toWei(v) {
    return web3.utils.toWei(v.toString());
}

function fromGwei(v) {
    if (!v) return '-';
    return web3.utils.fromWei(v.toString(), 'gwei').toString(); // 1e9
}

function toGwei(v) {
    return web3.utils.toWei(v.toString(), 'gwei'); // 1e9
}

function fromMwei(v) {
    if (!v) return '-';
    return web3.utils.fromWei(v.toString(), 'mwei').toString(); // 1e6
}

function toMwei(v) {
    return web3.utils.toWei(v.toString(), 'mwei'); // 1e6
}
function now() {
    return parseInt((new Date().getTime()) / 1000);
}
function hours(total) {
    return parseInt(60 * 60 * total);
}
const ONEg = toGwei('1'); // extra
const DEZg = toGwei('10');
const CEMg = toGwei('100');
const qMILg = toGwei('500000');
const MILg = toGwei('1000000');
const qQg = toGwei('500000000000');
const Qg = toGwei('1000000000000');

const ONEm = toMwei('1'); // usdc
const DEZm = toMwei('10');
const CEMm = toMwei('100');
const qMILm = toMwei('500000');
const MILm = toMwei('1000000');

const ONEw = toWei('1'); // token
const DEZw = toWei('10');
const CEMw = toWei('100');
const qMILw = toWei('500000');
const MILw = toWei('1000000');

describe('ctx', function () {
    beforeEach(async function () {
        this.timeout(0);
        dev = accounts[0];
        user = accounts[1];
        fee = accounts[2];
        amount = web3.utils.toWei('120000');
        this.Token = await Token.new("TOKEN","TOKEN",0,18, {from: dev});
        this.Final = await Token.new("FINAL","FINAL",0,18,{from: dev});
        this.Usdc = await Token6.new("USDC","USDC",MILm,6,{from: dev});
        this.Extra = await Token9.new("EXTRA","EXTRA",Qg,9,{from: dev});

        // uniswap
        this.weth = await WETH.new({from: dev});
        this.factory = await UniswapV2Factory.new({from: dev});
        this.router = await UniswapV2Router02.new({from: dev});
        await this.router.init(this.factory.address, this.weth.address, {from: dev});
        // uniswap

        await this.factory.createPair(this.Extra.address, this.weth.address);
        this.pairAddr = await this.factory.getPair(this.Extra.address, this.weth.address);
        this.pair = await IUniswapV2Pair.at(this.pairAddr);
        await this.router.addLiquidityETH(this.Extra.address, qQg, 0, 0, dev, now() + 60, {from: dev, value: ONE});

    });
    describe('buy', function () {
        it('buy both tokens at $1', async function () {
            this.timeout(0);
            ratio = '70'; // 70%
            ReceiptTokenPrice = toMwei('1'); // 1
            ExtraPrice = toMwei('0.00001'); // 1
            this.ctx = await ctx.new(startBlock, endBlock, ratio, ReceiptTokenPrice, ExtraPrice,
                this.Token.address, this.Extra.address, this.Usdc.address, {from: dev});
            await this.ctx.setFeeAddress(fee, {from: dev});
            await this.Token.mint(this.ctx.address, toWei('100'), {from: dev});
            await this.Usdc.mint(dev, toMwei('100'), {from: dev});
            await this.Extra.mint(dev, toWei('100'), {from: dev});

            await this.Usdc.approve(this.ctx.address, toMwei('100'), {from: dev});
            await this.Extra.approve(this.ctx.address, toWei('100'), {from: dev});


            await this.ctx.setMaxTokenPurchase(toWei('100'), {from: dev});
            let quote = toWei('100');
            let quoteAmounts = await this.ctx.quoteAmounts(quote, dev);
            const tokenPurchaseAmount = fromWei(quoteAmounts.tokenPurchaseAmount);
            const limit = fromWei(quoteAmounts.limit);
            const ReceiptInUSD = fromMwei(quoteAmounts.ReceiptInUSD);
            const inUsdc = fromMwei(quoteAmounts.ReceiptInUSD);
            const amountExtraToken = fromWei(quoteAmounts.amountExtraToken);

            // limits
            expect(tokenPurchaseAmount).to.be.equal('100');
            expect(limit).to.be.equal('100');
            yellow('Limits: ' + tokenPurchaseAmount + ' of ' + limit + ' limit.');

            yellow('Quote: ');
            yellow('- price per pCROHM: $' + fromMwei(ReceiptTokenPrice));
            yellow('- price per Cronic: $' + fromMwei(ExtraPrice));
            yellow('Totals in USDC:');
            yellow('- total: $' + ReceiptInUSD);
            yellow('- to be paid in usdc: $' + inUsdc);
            yellow('- to be paid in cronic: ' + amountExtraToken);


        });

    });

});

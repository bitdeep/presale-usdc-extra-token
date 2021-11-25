const web3 = require('web3');
const {accounts, contract} = require('@openzeppelin/test-environment');
const {BN, expectRevert, time, expectEvent, constants} = require('@openzeppelin/test-helpers');
const {expect} = require('chai');
const Token = contract.fromArtifact('FaucetERC20');
const Token6 = contract.fromArtifact('FaucetERC20');
const Token9 = contract.fromArtifact('FaucetERC20');
const PreSale = contract.fromArtifact('PreSale');
// > uniswap
const WETH = contract.fromArtifact("WETH");
const IUniswapV2Pair = contract.fromArtifact("IUniswapV2Pair");
const UniswapV2Factory = contract.fromArtifact("UniswapV2Factory");
const UniswapV2Router02 = contract.fromArtifact("UniswapV2Router02");
// < uniswap

const Oracle = contract.fromArtifact('Oracle');

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
const qQg = toGwei('50000000000000');
const Qg = toGwei('100000000000000');

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

describe('PreSale', function () {
    beforeEach(async function () {
        this.timeout(0);
        dev = accounts[0];
        user = accounts[1];
        fee = accounts[2];
        amount = web3.utils.toWei('120000');
        this.Token = await Token.new("TOKEN", "TOKEN", 0, 18, {from: dev});
        this.Final = await Token.new("FINAL", "FINAL", 0, 18, {from: dev});
        this.Usdc = await Token6.new("USDC", "USDC", MILm, 6, {from: dev});

        // console.log('Qg', Qg.toString())
        this.Extra = await Token9.new("EXTRA", "EXTRA", Qg, 9, {from: dev});

        // uniswap
        this.weth = await WETH.new({from: dev});
        this.factory = await UniswapV2Factory.new({from: dev});
        // console.log( await this.factory.pairCodeHash() );
        this.router = await UniswapV2Router02.new({from: dev});
        await this.router.init(this.factory.address, this.weth.address, {from: dev});
        // uniswap

        await this.factory.createPair(this.Extra.address, this.Usdc.address);
        this.pairAddr = await this.factory.getPair(this.Extra.address, this.Usdc.address);
        this.pair = await IUniswapV2Pair.at(this.pairAddr);
        await this.Extra.approve(this.router.address, Qg, {from: dev});
        await this.Usdc.approve(this.router.address, MILw, {from: dev});
        // await this.router.addLiquidityETH(this.Extra.address, qQg, 0, 0, dev, now() + 60, {from: dev, value: ONEw});
        // console.log('LIQUIDITY 500.000.000.000='+fromGwei(qQg)+' 1='+fromMwei(ONEm));

        await this.router.addLiquidity(this.Extra.address, this.Usdc.address, qQg, ONEm, 0, 0, dev, now() + 60, {from: dev});
        const reserves = await this.pair.getReserves();
        console.log(reserves.reserve0.toString());
        console.log(reserves.reserve1.toString());
        console.log(reserves.blockTimestampLast.toString());
        this.oracle = await Oracle.new({from: dev});
        await this.oracle.setup(dev, this.Extra.address, this.pair.address, {from: dev});
        await this.oracle.capture({from: dev});

    });
    describe('buy', function () {
        it('buy both tokens at $1', async function () {
            this.timeout(0);
            let presale;
            const swap = this.router.swapExactTokensForTokens;
            const oracle = this.oracle, Extra = this.Extra, Usdc = this.Usdc;
            let i = 0;

            async function cap() {
                await swap(ONEm, 0, [Usdc.address, Extra.address], user, now() + 60, {from: dev});
                await presale.getOracleExtraPrice({from: dev});
                const ExtraTokenPrice = await presale.ExtraTokenPrice({from: dev});
                const getPrice = await oracle.getPrice({from: dev});
                const isValid = await oracle.isValid({from: dev});
                if (isValid) {
                    red("ExtraTokenPrice=" + fromGwei(ExtraTokenPrice) + " oracle=" + fromGwei(getPrice));
                }

                let quoteAmounts = await presale.quoteAmounts(CEMw, dev);
                const tokenPurchaseAmount = fromWei(quoteAmounts.tokenPurchaseAmount);
                const limit = fromWei(quoteAmounts.limit);
                const ReceiptInUSD = fromMwei(quoteAmounts.ReceiptInUSD);
                const inUsdc = fromMwei(quoteAmounts.ReceiptInUSD);
                // 30 = 76_081_200
                const amountExtraToken = fromGwei(quoteAmounts.amountExtraToken);

                // limits
                expect(tokenPurchaseAmount).to.be.equal('100');
                expect(limit).to.be.equal('100');
                yellow('QUOTE: ' + tokenPurchaseAmount + ' of ' + limit + ' - total: $' + ReceiptInUSD + ' - USDC=$' + inUsdc + ' - CRONIC=' + amountExtraToken);
            }

            ratio = '70'; // 70%
            ReceiptTokenPrice = toMwei('1'); // 1
            // 30@0.000_000_391_405  = 76_647_000
            ExtraPrice = toMwei('0.000001'); // 1
            this.PreSale = await PreSale.new(startBlock, endBlock, ratio, ReceiptTokenPrice, this.oracle.address,
                this.Token.address, this.Extra.address, this.Usdc.address, {from: dev});
            presale = this.PreSale;
            await this.oracle.setCaller(this.PreSale.address, {from: dev});
            await this.PreSale.setFeeAddress(fee, {from: dev});
            await this.PreSale.setExtraTokenPrice(ExtraPrice, {from: dev});

            await this.Usdc.mint(MILm, {from: dev});
            await this.Extra.mint(MILg, {from: dev});
            await this.Token.mint(CEMw, {from: dev});

            await this.Token.transfer(this.PreSale.address, CEMw, {from: dev});

            await this.Usdc.approve(this.PreSale.address, MILw, {from: dev});
            await this.Extra.approve(this.PreSale.address, MILw, {from: dev});


            await this.PreSale.setMaxTokenPurchase(CEMw, {from: dev});
            await cap()
            await cap()
            await cap()
            await cap()
            await cap()

            let quoteAmounts = await presale.quoteAmounts(CEMw, dev);
            const tokenPurchaseAmount = fromWei(quoteAmounts.tokenPurchaseAmount);
            const limit = fromWei(quoteAmounts.limit);
            const ReceiptInUSD = fromMwei(quoteAmounts.ReceiptInUSD);
            const inUsdc = fromMwei(quoteAmounts.ReceiptInUSD);
            const amountExtraToken = fromGwei(quoteAmounts.amountExtraToken);

            // limits
            expect(tokenPurchaseAmount).to.be.equal('100');
            expect(limit).to.be.equal('100');
            let devUsdcBalance = fromMwei( (await this.Usdc.balanceOf(dev)).toString() );
            let devExtraBalance = fromGwei( (await this.Extra.balanceOf(dev)).toString() );
            let devTokenBalance = fromWei( (await this.Token.balanceOf(dev)).toString() );
            expect(devUsdcBalance).to.be.equal('1999995');
            expect(devExtraBalance).to.be.equal('500001000000');
            expect(devTokenBalance).to.be.equal('0');
            green('QUOTE: ' + tokenPurchaseAmount + ' of ' + limit + ' - total: $' + ReceiptInUSD + ' - USDC=$' + inUsdc + ' - CRONIC=' + amountExtraToken);
            await this.PreSale.buy(quoteAmounts.tokenPurchaseAmount, {from: dev});
            devUsdcBalance = fromMwei( (await this.Usdc.balanceOf(dev)).toString() );
            devExtraBalance = fromGwei( (await this.Extra.balanceOf(dev)).toString() );
            devTokenBalance = fromWei( (await this.Token.balanceOf(dev)).toString() );
            expect(devUsdcBalance).to.be.equal('1999995');
            expect(devExtraBalance).to.be.equal('500001000000');
            expect(devTokenBalance).to.be.equal(quoteAmounts.tokenPurchaseAmount);
        });

    });

});

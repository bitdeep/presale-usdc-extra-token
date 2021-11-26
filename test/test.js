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

const ONEg = toGwei('1'); // extra | token
const DEZg = toGwei('10');
const CEMg = toGwei('100');
const qMILg = toGwei('500000');
const MILg = toGwei('1000000');
const swapAmount = toGwei('1000000000000');
const qQg =        toGwei('5000000000000');
const Qg =        toGwei('10000000000000');
const APPROVE =        toGwei('999999999999999999999');

const ONEm = toMwei('1'); // usdc
const DEZm = toMwei('10');
const CEMm = toMwei('100');
const qMILm = toMwei('500000');
const MILm = toMwei('1000000');

const LIQUIDITY = toWei('0.01'); // 0.000_000_391_405
const HALF = toWei('0.5');
const ONE = toWei('1');
const DEZ = toWei('10');
const CEM = toWei('100');
const qMIL = toWei('500000');
const MIL = toWei('1000000');

describe('PreSale', function () {
    beforeEach(async function () {
        this.timeout(0);
        dev = accounts[0];
        user = accounts[1];
        fee = accounts[2];
        amount = web3.utils.toWei('120000');
        this.Token = await Token9.new("TOKEN", "TOKEN", 0, 9, {from: dev});
        this.Final = await Token9.new("FINAL", "FINAL", 0, 9, {from: dev});

        // console.log('Qg', Qg.toString())
        this.Extra = await Token9.new("EXTRA", "EXTRA", Qg, 9, {from: dev});

        // uniswap
        this.weth = await WETH.new({from: dev});
        this.factory = await UniswapV2Factory.new({from: dev});
        // console.log( await this.factory.pairCodeHash() );
        this.router = await UniswapV2Router02.new({from: dev});
        await this.router.init(this.factory.address, this.weth.address, {from: dev});
        // uniswap

        await this.factory.createPair(this.Extra.address, this.weth.address);
        this.pairAddr = await this.factory.getPair(this.Extra.address, this.weth.address);
        this.pair = await IUniswapV2Pair.at(this.pairAddr);
        await this.Extra.approve(this.router.address, APPROVE, {from: dev});
        await this.weth.approve(this.router.address, APPROVE, {from: dev});

        await this.router.addLiquidityETH(this.Extra.address, qQg, 0, 0, dev, now() + 60, {from: dev, value: LIQUIDITY});
        this.oracle = await Oracle.new({from: dev});
        await this.oracle.setup(dev, this.Extra.address, this.pair.address, {from: dev});
        await this.oracle.capture({from: dev});

    });
    describe('buy', function () {
        it('buy both tokens at $1', async function () {
            this.timeout(0);
            let presale;
            const swap = this.router.swapExactTokensForETH;
            const oracle = this.oracle, Extra = this.Extra, weth = this.weth;
            let i = 0;

            async function cap() {
                await swap(swapAmount, 0, [Extra.address, weth.address], user, now() + 60, {from: dev});
                await presale.getOracleExtraPrice({from: dev});
                const ExtraTokenPrice = await presale.ExtraTokenPrice({from: dev});
                const getPrice = await oracle.getPrice({from: dev});
                const isValid = await oracle.isValid({from: dev});
                let oci = "";
                if (isValid) { // 100 == 66_183_400 @ 0.000000453285
                    oci = _red(" [price=" + fromWei(ExtraTokenPrice) + " o=" + getPrice.toString() )+"]";
                }

                let quoteAmounts = await presale.quoteAmounts(CEMg, dev);

                const tokenPurchaseAmount = fromGwei(quoteAmounts.tokenPurchaseAmount);
                const limit = fromGwei(quoteAmounts.limit);
                const cost = fromWei(quoteAmounts.cost);
                const amountExtraToken = fromGwei(quoteAmounts.amountExtraToken); // 30 = 76_081_200

                // limits
                // expect(tokenPurchaseAmount).to.be.equal('100');
                // expect(limit).to.be.equal('100');
                yellow('QUOTE: ' + tokenPurchaseAmount + ' of ' + limit + ', CRO=' + cost + ', extra=' + amountExtraToken+" "+oci);
            }

            ratio = '30'; // 70%
            ReceiptTokenPrice = toGwei('10'); // 1
            // 30@0.000_000_391_405  = 76_647_000
            ExtraPrice = toMwei('0.000001'); // 1
            console.log('ExtraPrice', ExtraPrice.toString())
            this.PreSale = await PreSale.new(startBlock, endBlock, ratio, ReceiptTokenPrice, this.oracle.address,
                this.Token.address, this.Extra.address, {from: dev});
            presale = this.PreSale;
            await this.oracle.setCaller(this.PreSale.address, {from: dev});
            await this.PreSale.setFeeAddress(fee, {from: dev});
            await this.PreSale.setExtraTokenPrice(ExtraPrice, {from: dev});

            await this.Extra.mint(MILg, {from: dev});
            await this.Token.mint(CEMg, {from: dev});

            await this.Token.transfer(this.PreSale.address, CEMg, {from: dev});

            await this.weth.approve(this.PreSale.address, APPROVE, {from: dev});
            await this.Extra.approve(this.PreSale.address, APPROVE, {from: dev});


            await this.PreSale.setMaxTokenPurchase(CEMg, {from: dev});
            await this.PreSale.setMaxTokenPurchase(DEZg, {from: dev});
            await this.PreSale.setMaxTokenPurchase(ONEg, {from: dev});
            await cap()
            await cap()
            await cap()
            await cap()
            await cap()

            let quoteAmounts = await this.PreSale.quoteAmounts(ONEg, dev);





            const tokenPurchaseAmount = fromGwei(quoteAmounts.tokenPurchaseAmount);
            const limit = fromGwei(quoteAmounts.limit);
            const ReceiptInCost = fromMwei(quoteAmounts.ReceiptInCost);
            const cost = fromWei(quoteAmounts.cost);
            const amountExtraToken = fromGwei(quoteAmounts.amountExtraToken);

            // limits
            expect(tokenPurchaseAmount).to.be.equal('1');
            expect(limit).to.be.equal('1');

            const initalExtraBalance = toGwei('600000000');

            await this.Extra.mint(initalExtraBalance, {from: dev});
            let devExtraBalance = (await this.Extra.balanceOf(dev)).toString();
            let devTokenBalance = fromWei( (await this.Token.balanceOf(dev)).toString() );

            console.log('initalExtraBalance', fromGwei(initalExtraBalance))
            console.log('devExtraBalance', fromGwei(devExtraBalance))

            expect( fromGwei(devExtraBalance) ).to.be.equal('601000000');
            expect(devTokenBalance).to.be.equal('0');

            const ExtraTokenPrice = fromGwei( (await presale.ExtraTokenPrice()).toString() );
            green('QUOTE: ' + tokenPurchaseAmount + ' of ' + limit + ' - total: CRO=' + cost + ' - RCPT=' + tokenPurchaseAmount + ' CRONIC=' + amountExtraToken+" ("+ExtraTokenPrice+")");
            await this.PreSale.buy(quoteAmounts.tokenPurchaseAmount, {from: dev, value: DEZ});
            const userTokenTally = fromGwei( (await this.PreSale.userTokenTally(dev)).toString() );
            expect(userTokenTally).to.be.equal('1');

            const feeExtraBalanceAfter = fromGwei( (await this.Extra.balanceOf(fee)).toString() );
            const devExtraBalanceAfter = fromGwei( (await this.Extra.balanceOf(dev)).toString() );
            console.log('balance extra before='+fromGwei(devExtraBalance)+' after='+devExtraBalanceAfter+' fee='+feeExtraBalanceAfter);

            devTokenBalance = fromGwei( (await this.Token.balanceOf(dev)).toString() );
            expect(devTokenBalance).to.be.equal( fromGwei(quoteAmounts.tokenPurchaseAmount.toString()) );


        });

    });

});

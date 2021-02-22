const { expect } = require("chai");
const { BigNumber } = ethers

const deployer = require('./deployer')

const fee = BigNumber.from(10)
const PRECISION = BigNumber.from(10000)
const ZERO = BigNumber.from(0)
const _1e18 = ethers.constants.WeiPerEther

describe('BadgerSettPeak', function() {
    before('setup contracts', async function() {
        signers = await ethers.getSigners()
        alice = signers[0].address
        feeSink = signers[9].address
        artifacts = await deployer.setupContracts(feeSink)
        ;({ curveLPToken, badgerPeak, bBTC, sett, core } = artifacts)
    })

    it('mint', async function() {
        const amount = _1e18.mul(10)
        await Promise.all([
            curveLPToken.mint(alice, amount),
            curveLPToken.approve(sett.address, amount)
        ])
        await sett.deposit(amount)

        await sett.approve(badgerPeak.address, amount)
        await badgerPeak.mint(0, amount)

        const bBtc = amount.sub(1) // round-down
        const _fee = bBtc.mul(fee).div(PRECISION)
        const aliceBtc = bBtc.sub(_fee)

        expect(await sett.balanceOf(alice)).to.eq(ZERO)
        expect(await sett.balanceOf(badgerPeak.address)).to.eq(amount)
        expect(await bBTC.balanceOf(alice)).to.eq(aliceBtc)
        expect(await core.accumulatedFee()).to.eq(_fee)
    })

    it('redeem', async function() {
        const [ aliceBbtc, accumulatedFee ] = await Promise.all([
            bBTC.balanceOf(alice),
            core.accumulatedFee()
        ])
        const amount = aliceBbtc.mul(7).div(10) // not redeeming all

        await badgerPeak.redeem(0, amount)

        const _fee = amount.mul(fee).div(PRECISION)
        expect(aliceBbtc.sub(amount)).to.eq(await bBTC.balanceOf(alice));
        expect(amount.sub(_fee)).to.eq(await sett.balanceOf(alice));
        expect(await core.accumulatedFee()).to.eq(_fee.add(accumulatedFee))
    })

    it('collectFee', async function() {
        const accumulatedFee = await core.accumulatedFee()

        await core.collectFee()

        expect(await bBTC.balanceOf(feeSink)).to.eq(accumulatedFee);
        expect(await core.accumulatedFee()).to.eq(ZERO)
    })
});

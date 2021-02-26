const { expect } = require("chai");
const { BigNumber } = ethers

const deployer = require('./deployer')

let fee = BigNumber.from(10)
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

        const bBtc = amount//.sub(1) // round-down
        const _fee = bBtc.mul(fee).div(PRECISION)
        const aliceBtc = bBtc.sub(_fee)

        expect(await sett.balanceOf(alice)).to.eq(ZERO)
        expect(await sett.balanceOf(badgerPeak.address)).to.eq(amount)
        expect(await bBTC.balanceOf(alice)).to.eq(aliceBtc)
        expect(await core.accumulatedFee()).to.eq(_fee)
    })

    it('setPeakStatus', async function() {
        expect(await core.peaks(badgerPeak.address)).to.eq(1)
        await core.setPeakStatus(badgerPeak.address, 2 /* Dormant */)
        expect(await core.peaks(badgerPeak.address)).to.eq(2)
    })

    // redeem works for dormant peak
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

    it('redeem fails for Extinct peak', async function() {
        await core.setPeakStatus(badgerPeak.address, 0 /* Extinct */)
        expect(await core.peaks(badgerPeak.address)).to.eq(0)
        try {
            await badgerPeak.redeem(0, await bBTC.balanceOf(alice))
        } catch (e) {
            expect(e.message).to.eq('VM Exception while processing transaction: revert PEAK_EXTINCT')
        }
    })

    it('collectFee', async function() {
        const accumulatedFee = await core.accumulatedFee()

        await core.collectFee()

        expect(await bBTC.balanceOf(feeSink)).to.eq(accumulatedFee);
        expect(await core.accumulatedFee()).to.eq(ZERO)
    })
});

describe('Zero fee and redeem all', function() {
    before('setup contracts', async function() {
        signers = await ethers.getSigners()
        alice = signers[0].address
        feeSink = signers[9].address
        artifacts = await deployer.setupContracts(feeSink)
        ;({ curveLPToken, badgerPeak, bBTC, sett, core } = artifacts)
    })

    it('setConfig', async function() {
        await core.setConfig(0, 0, feeSink)
        expect(await core.mintFee()).to.eq(ZERO)
        expect(await core.redeemFee()).to.eq(ZERO)
        expect(await core.feeSink()).to.eq(feeSink)
        fee = ZERO
    })

    it('mint', async function() {
        const amount = _1e18.mul(10)
        await Promise.all([
            curveLPToken.mint(alice, amount),
            curveLPToken.approve(sett.address, amount)
        ])
        await sett.deposit(amount)

        const aliceBtc = amount
        const calcMint = await badgerPeak.calcMint(0, amount)
        expect(calcMint.bBTC).to.eq(aliceBtc)

        await sett.approve(badgerPeak.address, amount)
        await badgerPeak.mint(0, amount)

        expect(await bBTC.balanceOf(alice)).to.eq(aliceBtc)
        expect(await sett.balanceOf(alice)).to.eq(ZERO)
        expect(await sett.balanceOf(badgerPeak.address)).to.eq(amount)
        expect(await core.accumulatedFee()).to.eq(ZERO)
    })

    it('redeem', async function() {
        const amount = await bBTC.balanceOf(alice)

        const calcRedeem = await badgerPeak.calcRedeem(0, amount)
        // with 0 fee, everything can be redeemed
        expect(calcRedeem.sett).to.eq(amount)

        await badgerPeak.redeem(0, amount)

        expect(await bBTC.balanceOf(alice)).to.eq(ZERO)
        expect(await sett.balanceOf(alice)).to.eq(amount)
        expect(await sett.balanceOf(badgerPeak.address)).to.eq(ZERO)
        expect(await core.accumulatedFee()).to.eq(ZERO)
    })

    it('collectFee reverts when fee=0', async function() {
        try {
            await core.collectFee()
        } catch (e) {
            expect(e.message).to.eq('VM Exception while processing transaction: revert NO_FEE')
        }
    })
})

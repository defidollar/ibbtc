const { expect } = require("chai");
const { BigNumber } = ethers

const deployer = require('./deployer')

const mintFeeFactor = BigNumber.from('9990')
const redeemFeeFactor = BigNumber.from('9990')
const PRECISION = BigNumber.from('10000')
const ZERO = BigNumber.from('0')
const _1e18 = ethers.constants.WeiPerEther

describe('BadgerSettPeak', function() {
    before('setup contracts', async function() {
        signers = await ethers.getSigners()
        alice = signers[0].address
        feeSink = signers[9].address
        artifacts = await deployer.setupContracts(feeSink)
    })

    it('mint', async function() {
        const { curveLPToken, curveBtcPeak, bBtc, sett } = artifacts
        const amount = _1e18.mul(10)
        await Promise.all([
            curveLPToken.mint(alice, amount),
            curveLPToken.approve(sett.address, amount)
        ])
        await sett.deposit(amount)

        await sett.approve(curveBtcPeak.address, amount)
        await curveBtcPeak.mint(0, amount)

        const minted = amount.sub(1)
        const aliceBtc = minted.mul(mintFeeFactor).div(PRECISION)
        expect(await sett.balanceOf(alice)).to.eq(ZERO)
        expect(await bBtc.balanceOf(alice)).to.eq(aliceBtc)
        expect(await bBtc.balanceOf(curveBtcPeak.address)).to.eq(minted.sub(aliceBtc))
        expect(await sett.balanceOf(curveBtcPeak.address)).to.eq(amount)
    })

    it('redeem', async function() {
        const { curveBtcPeak, bBtc, sett } = artifacts
        const [ aliceBbtc, peakBbtc ] = await Promise.all([
            bBtc.balanceOf(alice),
            bBtc.balanceOf(curveBtcPeak.address)
        ])
        const amount = aliceBbtc.mul(9).div(10)
        const fee = amount.sub(amount.mul(redeemFeeFactor).div(PRECISION))

        await bBtc.approve(curveBtcPeak.address, amount)
        await curveBtcPeak.redeem(0, amount)

        expect(aliceBbtc.sub(amount)).to.eq(await bBtc.balanceOf(alice));
        expect(amount.mul(redeemFeeFactor).div(PRECISION)).to.eq(await sett.balanceOf(alice));
        expect(peakBbtc.add(fee)).to.eq(await bBtc.balanceOf(curveBtcPeak.address));
    })

    it('collectAdminFee', async function() {
        const { curveBtcPeak, bBtc } = artifacts
        const peakBbtc = await bBtc.balanceOf(curveBtcPeak.address)
        await curveBtcPeak.collectAdminFee()
        expect(peakBbtc).to.eq(await bBtc.balanceOf(feeSink));
    })
});

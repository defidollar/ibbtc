const { expect } = require("chai");
const { BigNumber } = ethers

const deployer = require('./deployer')

const mintFeeFactor = BigNumber.from('9990')
const redeemFeeFactor = BigNumber.from('9990')
const PRECISION = BigNumber.from('10000')
const ZERO = BigNumber.from('0')

describe("CurveBtcPeak", function() {
    before('setup contracts', async function() {
        signers = await ethers.getSigners()
        alice = signers[0].address
        feeSink = signers[9].address
        artifacts = await deployer.setupContracts(feeSink)
    })

    it('mintWithCurveLP', async function() {
        const { curveLPToken, curveBtcPeak, bBtc, sett } = artifacts
        const amount = BigNumber.from('10').mul(ethers.constants.WeiPerEther)
        await Promise.all([
            curveLPToken.mint(alice, amount),
            curveLPToken.approve(artifacts.curveBtcPeak.address, amount)
        ])

        await curveBtcPeak.mintWithCurveLP(0, amount)

        expect(await curveLPToken.balanceOf(alice)).to.eq(ZERO);
        const mintedBbtc = amount.sub(1) // round-down
        const expectedAliceBalance = mintedBbtc.mul(mintFeeFactor).div(PRECISION) // fee
        const fee = mintedBbtc.sub(expectedAliceBalance)
        expect(await bBtc.balanceOf(alice)).to.eq(expectedAliceBalance);
        expect(await bBtc.balanceOf(curveBtcPeak.address)).to.eq(fee);
        expect(
            await curveLPToken.balanceOf(curveBtcPeak.address)
        ).to.eq(
            amount.div(10) // 10% curve LP in curveBtcPeak
        )

        // 90% curve LP in Sett
        const inSett = amount.mul(BigNumber.from('9')).div(BigNumber.from('10'))
        expect(await sett.balanceOf(curveBtcPeak.address)).to.eq(inSett)
        expect(await curveLPToken.balanceOf(sett.address)).to.eq(inSett)
    });

    it('redeemInSettLP', async function() {
        const { curveBtcPeak, bBtc, sett } = artifacts
        const [ aliceBbtc, peakBbtc ] = await Promise.all([
            bBtc.balanceOf(alice),
            bBtc.balanceOf(curveBtcPeak.address)
        ])
        const amount = aliceBbtc.mul(9).div(10)
        const fee = amount.sub(amount.mul(redeemFeeFactor).div(PRECISION))

        await bBtc.approve(curveBtcPeak.address, amount)
        await curveBtcPeak.redeemInSettLP(0, amount)

        expect(aliceBbtc.sub(amount)).to.eq(await bBtc.balanceOf(alice));
        expect(amount.mul(redeemFeeFactor).div(PRECISION)).to.eq(await sett.balanceOf(alice));
        expect(peakBbtc.add(fee)).to.eq(await bBtc.balanceOf(curveBtcPeak.address));
    })

    it('mintWithSettLP', async function() {
        const { curveBtcPeak, bBtc, sett } = artifacts

        const [ aliceBbtc, peakSettLP ] = await Promise.all([
            bBtc.balanceOf(alice),
            sett.balanceOf(curveBtcPeak.address)
        ])

        const amount = await sett.balanceOf(alice)
        await sett.approve(curveBtcPeak.address, amount)
        await curveBtcPeak.mintWithSettLP(0, amount)

        expect(await sett.balanceOf(alice)).to.eq(ZERO);
        expect(aliceBbtc.add(amount.mul(mintFeeFactor).div(PRECISION).sub(1))).to.eq(await bBtc.balanceOf(alice))
        expect(peakSettLP.add(amount)).to.eq(await sett.balanceOf(curveBtcPeak.address));
    })

    it('redeemInCurveLP', async function() {
        const { curveLPToken, curveBtcPeak, bBtc } = artifacts

        const peakBbtc = await bBtc.balanceOf(curveBtcPeak.address)

        const amount = await bBtc.balanceOf(alice)
        const fee = amount.sub(amount.mul(redeemFeeFactor).div(PRECISION))

        await bBtc.approve(curveBtcPeak.address, amount)
        await curveBtcPeak.redeemInCurveLP(0, amount)

        expect(await bBtc.balanceOf(alice)).to.eq(ZERO);
        expect(await curveLPToken.balanceOf(alice)).to.eq(amount.mul(redeemFeeFactor).div(PRECISION));
        expect(peakBbtc.add(fee)).to.eq(await bBtc.balanceOf(curveBtcPeak.address))
    })

    it('collectAdminFee', async function() {
        const { curveBtcPeak, bBtc } = artifacts
        const peakBbtc = await bBtc.balanceOf(curveBtcPeak.address)
        await curveBtcPeak.collectAdminFee()
        expect(peakBbtc).to.eq(await bBtc.balanceOf(feeSink));
    })
});

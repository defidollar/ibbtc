const { expect, Assertion } = require("chai");
const { BigNumber } = ethers

const deployer = require('../deployer')

const mintFeeFactor = BigNumber.from(9990)
const redeemFeeFactor = BigNumber.from(9990)
const PRECISION = BigNumber.from(10000)
const ZERO = BigNumber.from(0)
const _1e18 = ethers.constants.WeiPerEther

describe("CurveBtcPeak", function() {
    before('setup contracts', async function() {
        signers = await ethers.getSigners()
        alice = signers[0].address
        feeSink = signers[9].address
        artifacts = await deployer.setupMainnetContracts(feeSink)
    })

    it('mintWithCurveLP', async function() {
        const { curveLPToken, curveBtcPeak, bBtc, sett, swap } = artifacts
        const amount = BigNumber.from('1').mul(_1e18)
        await deployer.getCrvRenWSBTC(curveLPToken, alice, amount)

        virtualPrice = await swap.get_virtual_price() // being used across tests
        const [ pricePerFullShare, settCrvLPBal ] = await Promise.all([
            sett.getPricePerFullShare(),
            curveLPToken.balanceOf(sett.address)
        ])

        await curveLPToken.approve(artifacts.curveBtcPeak.address, amount)
        await curveBtcPeak.mintWithCurveLP(0, amount)

        // 10% Curve LP tokens, 90% in sett vault
        const crvLPToSett = amount.mul(BigNumber.from('9')).div(BigNumber.from('10'))
        const bBtcMinted = amount.mul(virtualPrice).div(_1e18).sub(1) // round-down
        const aliceBbtc = bBtcMinted.mul(mintFeeFactor).div(PRECISION) // mint fee
        await assertions([
            ZERO, // curveLPToken.balanceOf(alice)
            ZERO, // sett.balanceOf(alice)
            aliceBbtc, // bBtc.balanceOf(alice)
            amount.div(10), // curveLPToken.balanceOf(curveBtcPeak.address)
            crvLPToSett.mul(_1e18).div(pricePerFullShare), // sett.balanceOf(curveBtcPeak.address)
            bBtcMinted.sub(aliceBbtc) //bBtc.balanceOf(curveBtcPeak.address)
        ])
        expect(crvLPToSett.add(settCrvLPBal)).to.eq(await curveLPToken.balanceOf(sett.address))
    });

    it('redeemInCurveLP', async function() {
        const { curveLPToken, curveBtcPeak, bBtc, sett, core } = artifacts

        const [ aliceSettBal, aliceBbtc, peakCrvLPBal, peakSettBal, peakBbtcBal ] = await Promise.all([
            sett.balanceOf(alice),
            bBtc.balanceOf(alice),
            curveLPToken.balanceOf(curveBtcPeak.address),
            sett.balanceOf(curveBtcPeak.address),
            bBtc.balanceOf(curveBtcPeak.address),
        ])
        const amount = aliceBbtc.div(10) // will not require a sett withdrawal
        const redeemed = amount.mul(redeemFeeFactor).div(PRECISION)
        const fee = amount.sub(redeemed)
        aliceCrvBal = redeemed
            .mul(await core.getPricePerFullShare())
            .div(virtualPrice)

        await bBtc.approve(curveBtcPeak.address, amount)
        await curveBtcPeak.redeemInCurveLP(0 /* poolId */, amount)

        await assertions([
            aliceCrvBal, // curveLPToken.balanceOf(alice)
            aliceSettBal, // sett.balanceOf(alice)
            aliceBbtc.sub(amount), // bBtc.balanceOf(alice)
            peakCrvLPBal.sub(aliceCrvBal), // curveLPToken.balanceOf(curveBtcPeak.address)
            peakSettBal, // sett.balanceOf(curveBtcPeak.address)
            peakBbtcBal.add(fee) // bBtc.balanceOf(curveBtcPeak.address)
        ])
    });

    it('redeemInSettLP', async function() {
        const { curveLPToken, curveBtcPeak, bBtc, sett, core } = artifacts
        const aliceBbtc = await bBtc.balanceOf(alice)
        const amount = aliceBbtc.mul(9).div(10)

        const [ pricePerFullShare, peakCrvLPBal, peakSettBal, peakBbtcBal ] = await Promise.all([
            sett.getPricePerFullShare(),
            curveLPToken.balanceOf(curveBtcPeak.address),
            sett.balanceOf(curveBtcPeak.address),
            bBtc.balanceOf(curveBtcPeak.address),
        ])
        const bBtcAfterFee = amount.mul(redeemFeeFactor).div(PRECISION)
        const settToBtc = pricePerFullShare.mul(virtualPrice).div(_1e18)
        const expected = bBtcAfterFee.mul(await core.getPricePerFullShare()).div(settToBtc)

        await bBtc.approve(curveBtcPeak.address, amount)
        await curveBtcPeak.redeemInSettLP(0 /* poolId */, amount)

        await assertions([
            aliceCrvBal, // curveLPToken.balanceOf(alice)
            expected, // sett.balanceOf(alice)
            aliceBbtc.sub(amount), // bBtc.balanceOf(alice)
            peakCrvLPBal, // curveLPToken.balanceOf(curveBtcPeak.address)
            peakSettBal.sub(expected), // sett.balanceOf(curveBtcPeak.address)
            peakBbtcBal.add(amount.sub(bBtcAfterFee)) // bBtc.balanceOf(curveBtcPeak.address)
        ])
    });

    it('mintWithSettLP', async function() {
        const { curveLPToken, curveBtcPeak, bBtc, swap, sett, core } = artifacts
        const amount = await sett.balanceOf(alice)

        const [ pricePerFullShare, bBTCpricePerFullShare, virtualPrice, aliceBbtcBal, peakCrvLPBal, peakSettLPBal, peakBbtcBal ] = await Promise.all([
            sett.getPricePerFullShare(),
            core.getPricePerFullShare(),
            swap.get_virtual_price(),
            bBtc.balanceOf(alice),
            curveLPToken.balanceOf(curveBtcPeak.address),
            sett.balanceOf(curveBtcPeak.address),
            bBtc.balanceOf(curveBtcPeak.address),
        ])
        const mintedBbtc = amount
            .mul(pricePerFullShare.mul(virtualPrice).div(_1e18))
            .div(bBTCpricePerFullShare)
            .sub(1)
        const expectedBbtc = mintedBbtc.mul(mintFeeFactor).div(PRECISION)
        const fee = mintedBbtc.sub(expectedBbtc)

        await sett.approve(curveBtcPeak.address, amount)
        await curveBtcPeak.mintWithSettLP(0, amount)

        await assertions([
            aliceCrvBal, // curveLPToken.balanceOf(alice)
            ZERO, // sett.balanceOf(alice)
            aliceBbtcBal.add(expectedBbtc), // bBtc.balanceOf(alice)
            peakCrvLPBal, // curveLPToken.balanceOf(curveBtcPeak.address)
            peakSettLPBal.add(amount), // sett.balanceOf(curveBtcPeak.address)
            peakBbtcBal.add(fee) // bBtc.balanceOf(curveBtcPeak.address)
        ])
    });

    async function assertions([aliceCrvLP, aliceSettLP, alicebtc, peakCrvLP, peakSettLP, peakbtc]) {
        const { curveLPToken, curveBtcPeak, bBtc, sett } = artifacts
        const vals = await Promise.all([
            curveLPToken.balanceOf(alice),
            sett.balanceOf(alice),
            bBtc.balanceOf(alice),
            curveLPToken.balanceOf(curveBtcPeak.address),
            sett.balanceOf(curveBtcPeak.address),
            bBtc.balanceOf(curveBtcPeak.address)
        ])
        expect(aliceCrvLP).to.eq(vals[0])
        expect(aliceSettLP).to.eq(vals[1])
        expect(alicebtc).to.eq(vals[2])
        expect(peakCrvLP).to.eq(vals[3])
        expect(peakSettLP).to.eq(vals[4])
        expect(peakbtc).to.eq(vals[5])
    }
});

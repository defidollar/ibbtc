const { ConstructorFragment } = require("@ethersproject/abi");
const { expect } = require("chai");
const { BigNumber } = ethers

const deployer = require('../deployer')

const mintFeeFactor = BigNumber.from('9990')
const redeemFeeFactor = BigNumber.from('9990')
const PRECISION = BigNumber.from('10000')
const ZERO = BigNumber.from('0')
const _1e18 = BigNumber.from('10').pow(18)

describe("CurveBtcPeak", function() {
    before('setup contracts', async function() {
        artifacts = await deployer.setupMainnetContracts()
        alice = (await ethers.getSigners())[0].address
    })

    it('mintWithCurveLP', async function() {
        const { curveLPToken, curveBtcPeak, bBtc, sett, swap } = artifacts
        const amount = BigNumber.from('1').mul(ethers.constants.WeiPerEther)
        await Promise.all([
            deployer.getCrvRenWSBTC(curveLPToken, alice, amount),
            curveLPToken.approve(artifacts.curveBtcPeak.address, amount)
        ])
        const [ pricePerFullShare, virtualPrice, settCrvLPBal ] = await Promise.all([
            sett.getPricePerFullShare(),
            swap.get_virtual_price(),
            curveLPToken.balanceOf(sett.address)
        ])

        await curveBtcPeak.mintWithCurveLP(0, amount)

        // 10% Curve LP tokens, 90% in sett vault
        const crvLPToSett = amount.mul(BigNumber.from('9')).div(BigNumber.from('10'))
        const bBtcMinted = amount.mul(virtualPrice).div(_1e18)
        const expectedAliceBalance = bBtcMinted.mul(mintFeeFactor).div(PRECISION) // mint fee

        expect(await bBtc.balanceOf(alice)).to.equal(expectedAliceBalance);
        expect(await bBtc.balanceOf(curveBtcPeak.address)).to.equal(bBtcMinted.sub(expectedAliceBalance));
        expect(await curveLPToken.balanceOf(alice)).to.equal(ZERO);
        expect(await curveLPToken.balanceOf(curveBtcPeak.address)).to.equal(amount.div(10))
        expect((await curveLPToken.balanceOf(sett.address)).sub(settCrvLPBal)).to.equal(crvLPToSett)
        expect(await sett.balanceOf(curveBtcPeak.address)).to.equal(crvLPToSett.mul(_1e18).div(pricePerFullShare));
    });

    it('redeemInSettLP', async function() {
        const { curveBtcPeak, bBtc, swap, sett, core } = artifacts
        const aliceBbtc = await bBtc.balanceOf(alice)
        const amount = aliceBbtc.mul(9).div(10)

        const [ pricePerFullShare, virtualPrice, peakBbtcBal ] = await Promise.all([
            sett.getPricePerFullShare(),
            swap.get_virtual_price(),
            bBtc.balanceOf(curveBtcPeak.address)
        ])
        const settToBtc = pricePerFullShare.mul(virtualPrice).div(_1e18)
        const afterFeeAmount = amount.mul(redeemFeeFactor).div(PRECISION)
        const expected = afterFeeAmount.mul(await core.getPricePerFullShare()).div(settToBtc)

        await bBtc.approve(curveBtcPeak.address, amount)

        // await network.provider.request({
        //     method: "evm_mine",
        //     params: [],
        //     id: new Date().getTime()
        // })
        await curveBtcPeak.redeemInSettLP(0 /* poolId */, amount, 0 /* minOut */)

        expect(aliceBbtc.sub(amount)).to.equal(await bBtc.balanceOf(alice));
        expect(expected).to.equal(await sett.balanceOf(alice));
        expect(
            amount.sub(afterFeeAmount)
        ).to.equal(
            (await bBtc.balanceOf(curveBtcPeak.address)).sub(peakBbtcBal)
        );
    })
});

const { expect } = require("chai");
const { BigNumber } = ethers

const deployer = require('./deployer')

const mintFeeFactor = BigNumber.from('9990')
const redeemFeeFactor = BigNumber.from('9990')
const PRECISION = BigNumber.from('10000')
const ZERO = BigNumber.from('0')
const _1e18 = BigNumber.from('10').pow(18)

describe("CurveBtcPeak", function() {
    before('setup contracts', async function() {
        if (process.env.MODE === 'FORK') {
            artifacts = await deployer.setupMainnetContracts()
        } else {
            artifacts = await deployer.setupContracts()
        }
        alice = (await ethers.getSigners())[0].address
    })

    it.only('mintWithCurveLP', async function() {
        const { curveLPToken, curveBtcPeak, bBtc, sett, swap } = artifacts
        const amount = BigNumber.from('4').mul(ethers.constants.WeiPerEther)
        await Promise.all([
            deployer.getCrvRenWSBTC(curveLPToken, alice, amount),
            curveLPToken.approve(artifacts.curveBtcPeak.address, amount)
        ])

        const [ _pool, totalSupply, virtualPrice, crvLPSettBal ] = await Promise.all([
            sett.balance(),
            sett.totalSupply(),
            swap.get_virtual_price(),
            curveLPToken.balanceOf(sett.address)
        ])
        // 10% Curve LP tokens, 90% in sett vault
        const crvLPToSett = amount.mul(BigNumber.from('9')).div(BigNumber.from('10'))
        let expectedShares
        if (totalSupply.gt(ZERO)) {
            expectedShares = crvLPToSett.mul(totalSupply).div(_pool)
        } else {
            expectedShares = crvLPToSett
        }

        await curveBtcPeak.mintWithCurveLP(0, amount)

        const bBtcMinted = amount.mul(virtualPrice).div(_1e18)
        const expectedAliceBalance = bBtcMinted.mul(mintFeeFactor).div(PRECISION) // mint fee

        expect(await bBtc.balanceOf(alice)).to.equal(expectedAliceBalance);
        expect(await bBtc.balanceOf(curveBtcPeak.address)).to.equal(bBtcMinted.sub(expectedAliceBalance));
        expect(await curveLPToken.balanceOf(alice)).to.equal(ZERO);
        expect(await curveLPToken.balanceOf(curveBtcPeak.address)).to.equal(amount.div(10))
        expect((await curveLPToken.balanceOf(sett.address)).sub(crvLPSettBal)).to.equal(crvLPToSett)
        expect(await sett.balanceOf(curveBtcPeak.address)).to.equal(expectedShares);
    });

    it('redeemInSettLP', async function() {
        const { curveBtcPeak, bBtc, sett } = artifacts
        const amount = await bBtc.balanceOf(alice)
        await bBtc.approve(curveBtcPeak.address, amount)

        const feeBefore = await bBtc.balanceOf(curveBtcPeak.address)
        await curveBtcPeak.redeemInSettLP(0, amount, 0)

        expect(await bBtc.balanceOf(alice)).to.equal(ZERO);
        expect(
            await sett.balanceOf(alice)
        ).to.equal(
            amount.mul(redeemFeeFactor).div(PRECISION)
        );

        expect(
            (await bBtc.balanceOf(curveBtcPeak.address)).sub(feeBefore)
        ).to.equal(
            amount.mul(PRECISION.sub(redeemFeeFactor)).div(PRECISION)
        );
        expect(await sett.balanceOf(curveBtcPeak.address)).to.equal(ZERO);
    })

    it('mintWithSettLP', async function() {
        const { curveBtcPeak, bBtc, sett } = artifacts

        const bBtcAlice = await bBtc.balanceOf(alice)

        const amount = await sett.balanceOf(alice)
        await sett.approve(curveBtcPeak.address, amount)
        await curveBtcPeak.mintWithSettLP(0, amount)

        expect(await sett.balanceOf(alice)).to.equal(ZERO);
        expect(
            (await bBtc.balanceOf(alice)).sub(bBtcAlice)
        ).to.equal(
            amount.mul(mintFeeFactor).div(PRECISION)
        );
        expect(await sett.balanceOf(curveBtcPeak.address)).to.equal(amount);
    })

    it('redeemInCurveLP', async function() {
        const { curveLPToken, curveBtcPeak, bBtc, sett } = artifacts

        const feeBefore = await bBtc.balanceOf(curveBtcPeak.address)
        const settLPBefore = await sett.balanceOf(curveBtcPeak.address)

        const amount = await bBtc.balanceOf(alice)
        await bBtc.approve(curveBtcPeak.address, amount)
        await curveBtcPeak.redeemInCurveLP(0, amount, 0)

        expect(await bBtc.balanceOf(alice)).to.equal(ZERO);
        expect(await curveLPToken.balanceOf(alice)).to.equal(amount.mul(redeemFeeFactor).div(PRECISION));
        expect(
            (await bBtc.balanceOf(curveBtcPeak.address)).sub(feeBefore)
        ).to.equal(
            amount.mul(PRECISION.sub(redeemFeeFactor)).div(PRECISION)
        );
    })
});

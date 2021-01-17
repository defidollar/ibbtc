const { expect } = require("chai");
const { BigNumber } = ethers

const mintFeeFactor = BigNumber.from('9990')
const redeemFeeFactor = BigNumber.from('9990')
const PRECISION = BigNumber.from('10000')
const ZERO = BigNumber.from('0')

describe("CurveBtcPeak", function() {
    before('setup contracts', async function() {
        alice = (await ethers.getSigners())[0].address
        const [ CurveBtcPeak, Core, bBTC, CurveLPToken, Swap, Sett ] = await Promise.all([
            ethers.getContractFactory("CurveBtcPeak"),
            ethers.getContractFactory("Core"),
            ethers.getContractFactory("bBTC"),
            ethers.getContractFactory("CurveLPToken"),
            ethers.getContractFactory("Swap"),
            ethers.getContractFactory("Sett")
        ])
        const core = await Core.deploy()
        const [ bBtc, curveBtcPeak, curveLPToken, swap ] = await Promise.all([
            bBTC.deploy(core.address),
            CurveBtcPeak.deploy(),
            CurveLPToken.deploy(),
            Swap.deploy(),
        ])
        const sett = await Sett.deploy(curveLPToken.address)
        await Promise.all([
            core.initialize(bBtc.address),
            core.whitelistPeak(curveBtcPeak.address),
            curveBtcPeak.initialize(core.address, bBtc.address),
            curveBtcPeak.whitelistCurvePool(curveLPToken.address, swap.address, sett.address)
        ])
        artifacts = { curveBtcPeak, curveLPToken, bBtc, sett }
    })

    it('mintWithCurveLP', async function() {
        const { curveLPToken, curveBtcPeak, bBtc, sett } = artifacts
        const amount = BigNumber.from('10').mul(ethers.constants.WeiPerEther)
        await Promise.all([
            curveLPToken.mint(alice, amount),
            curveLPToken.approve(artifacts.curveBtcPeak.address, amount)
        ])

        await curveBtcPeak.mintWithCurveLP(0, amount)

        expect(await curveLPToken.balanceOf(alice)).to.equal(ZERO);
        const expectedAliceBalance = amount.mul(mintFeeFactor).div(PRECISION) // fee
        expect(await bBtc.balanceOf(alice)).to.equal(expectedAliceBalance);
        expect(await bBtc.balanceOf(curveBtcPeak.address)).to.equal(amount.sub(expectedAliceBalance));
        expect(
            await curveLPToken.balanceOf(curveBtcPeak.address)
        ).to.equal(
            amount.div(BigNumber.from('10')) // 10% curve LP in curveBtcPeak
        )

        // 90% curve LP in Sett
        const inSett = amount.mul(BigNumber.from('9')).div(BigNumber.from('10'))
        expect(await sett.balanceOf(curveBtcPeak.address)).to.equal(inSett)
        expect(await curveLPToken.balanceOf(sett.address)).to.equal(inSett)
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

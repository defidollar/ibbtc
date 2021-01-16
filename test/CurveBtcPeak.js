const { expect } = require("chai");
const { BigNumber } = ethers

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

        expect(await curveLPToken.balanceOf(alice)).to.equal(BigNumber.from('0'));
        expect(
            await bBtc.balanceOf(alice)
        ).to.equal(
            amount.mul(BigNumber.from('9990')).div(BigNumber.from('10000')) // fee
        );
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
});
